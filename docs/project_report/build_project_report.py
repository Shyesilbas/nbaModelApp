"""Proje raporu PDF'ini uretir. Yeni bolum eklemek icin SECTIONS listesine fonksiyon ekle.

Kullanim: python3 docs/project_report/build_project_report.py [cikti.pdf]
Canli rakamlar reports/evaluation altindaki JSON raporlarindan okunur."""
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]

LEDGER = json.loads((ROOT / "reports/evaluation/paper_ledger_2026_27.json").read_text())
_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
_d = LEDGER["generated_utc"]
UPDATED = f"{int(_d[8:10])} {_MONTHS[int(_d[5:7]) - 1]} {_d[:4]}"

# ---------------------------------------------------------------------------------------------
# Veri katmani: rapordaki her rakam, tablo ve ornek hesap buradaki kaynaklardan okunur ya da
# hesaplanir. Anlatim metni disinda elle yazilmis rakam yoktur.
# ---------------------------------------------------------------------------------------------
import inspect  # noqa: E402
import re  # noqa: E402

import joblib  # noqa: E402
import yaml  # noqa: E402

sys.path.insert(0, str(ROOT))
from src.api.services.paper_trading import grade, load_results, read_ledger  # noqa: E402
from src.evaluation import bootstrap as _bs  # noqa: E402
from src.evaluation.paper_ledger import _team_games, elo_baseline  # noqa: E402
from src.evaluation.status_blocks import LEDGER_MIN_GAMES  # noqa: E402
from src.features import continuous_elo as _elo  # noqa: E402
from src.features.win_strength_features import season_opening_ratings  # noqa: E402


def _json(rel):
    return json.loads((ROOT / rel).read_text())


def pc(x, d=1):
    """0.662 -> '%66.2'"""
    return f"%{x * 100:.{d}f}"


def tr(n):
    """6276 -> '6.276'"""
    return f"{int(n):,}".replace(",", ".")


def ci_txt(c, d=4):
    return f"[{c['ci_low']:+.{d}f}, {c['ci_high']:+.{d}f}]"


def tr_date(iso):
    return f"{int(iso[8:10])} {_MONTHS[int(iso[5:7]) - 1]}"


BT = _json("reports/evaluation/multi_season_walk_forward_backtest.json")
SIG, AW, AS, AP = BT["significance_vs_baseline"], BT["aggregate_win"], BT["aggregate_score"], BT["aggregate_player"]
AUD, REL, CC, FOLDS = BT["win_availability_audit"], BT["win_reliability"], BT["win_confidence_calibration"], BT["folds"]
NG = BT["total_unseen_games"]
NGT = tr(NG)
NF = len(FOLDS)
SEASONS_BT = [f["test_season"] for f in FOLDS]
WM = _json("models/production/win_metadata.json")
SM = _json("models/production/score_metadata.json")
PM = _json("models/production/player_metadata.json")
WIN_FEATURES = _json("models/production/win_features.json")
MANIFEST = yaml.safe_load((ROOT / "config/training_manifest.yaml").read_text())
LC = _json("reports/evaluation/win_learning_curve.json")
CUR = LEDGER["current_live"]
ALLV = LEDGER["all_valid"]
SEASON = LEDGER["season"]
RELEASE = LEDGER["production_release"]


def wins(path):
    """Number of backtest folds where the model beat its baseline (lower loss is better)."""
    return sum(1 for f in FOLDS if path(f))


WINS_BRIER = wins(lambda f: f["win"]["production"]["brier"] < f["win"]["pregame_elo"]["brier"])
WINS_TOTAL = wins(lambda f: f["score"]["model"]["total_mae"] < f["score"]["rolling_baseline"]["total_mae"])
WINS_MARGIN = wins(lambda f: f["score"]["model"]["margin_mae"] < f["score"]["rolling_baseline"]["margin_mae"])
WINS_PLAYER = {t: wins(lambda f, t=t: f["player"][t]["model_mae"] < f["player"][t]["baseline_mae"]) for t in ("pts", "reb", "ast")}

# --- Elo: sabitler ve acilis puanlari -------------------------------------------------------
K_ELO, HCA, CARRY, ELO0 = _elo.BASE_K_FACTOR, _elo.HOME_COURT_ADVANTAGE, _elo.SEASON_REGRESSION, _elo.INITIAL_ELO
MOV_LO, MOV_HI = _elo.compute_mov_multiplier(0, 0), _elo.compute_mov_multiplier(1000, 0)
_m = re.search(r"scored ([\d.]+) vs ([\d.]+) for the old K=(\d+)/HCA=(\d+)/([\d.]+)", inspect.getsource(_elo))
ELO_GRID = {"new": _m.group(1), "old": _m.group(2), "k": _m.group(3), "hca": _m.group(4), "carry": _m.group(5).rstrip(".")}


def elo_prob(diff):
    return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))


OPEN = season_opening_ratings(SEASON)
_ranked = sorted(OPEN.items(), key=lambda kv: -kv[1])
OPEN_TOP, OPEN_BOT = _ranked[:3], list(reversed(_ranked[-3:]))
OPEN_SPREAD = _ranked[0][1] - _ranked[-1][1]
TEAM_GAMES = _team_games(SEASON)


def _first_game():
    first = TEAM_GAMES[TEAM_GAMES["GAME_DATE"] == TEAM_GAMES["GAME_DATE"].min()]
    gid = sorted(first["GAME_ID"].unique())[0]
    g = first[first["GAME_ID"] == gid]
    h, a = g[g["MATCHUP"].str.contains("vs.", regex=False)].iloc[0], g[g["MATCHUP"].str.contains("@", regex=False)].iloc[0]
    won = 1.0 if h["WL"] == "W" else 0.0
    margin = float(h["PTS"] - a["PTS"])
    he, ae = OPEN[h["TEAM_ABBREVIATION"]], OPEN[a["TEAM_ABBREVIATION"]]
    diff = he + HCA - ae
    exp = elo_prob(diff)
    mult = _elo.compute_mov_multiplier(margin, diff if won else -diff)
    shift = K_ELO * mult * (won - exp)
    check = elo_baseline(SEASON, TEAM_GAMES)[gid]
    assert abs(check - exp) < 1e-9, "Elo ornegi motorla uyusmuyor"
    return {"date": str(h["GAME_DATE"])[:10], "home": h["TEAM_ABBREVIATION"], "away": a["TEAM_ABBREVIATION"], "he": he, "ae": ae,
            "diff": diff, "exp": exp, "won": won, "hp": int(h["PTS"]), "ap": int(a["PTS"]), "margin": margin, "mult": mult,
            "shift": shift, "plain_shift": K_ELO * (won - exp)}


FG = _first_game()

# --- Canli defter: Elo ile model en cok ayristiginda ----------------------------------------
_graded = grade(read_ledger(SEASON), load_results(SEASON))
_elo_all = elo_baseline(SEASON, TEAM_GAMES)
_live = []
for _g in _graded:
    if _g["status"] == "final" and _g["valid"] and _g.get("model_version") == RELEASE and _g["origin"] == "live" and _g["game_id"] in _elo_all:
        _y = 1.0 if _g["actual_winner"] == _g["home_team"] else 0.0
        _live.append({**_g, "y": _y, "pe": _elo_all[_g["game_id"]], "pm": _g["home_win_probability"]})
for _r in _live:
    _r["gain"] = (_r["pe"] - _r["y"]) ** 2 - (_r["pm"] - _r["y"]) ** 2  # pozitif: model Elo'dan iyi
EX_MODEL, EX_ELO = max(_live, key=lambda r: r["gain"]), min(_live, key=lambda r: r["gain"])

# --- Elo ve model tahminleri hakkinda turetilmis olcekler -----------------------------------
_se = (SIG["score_total"]["ci_high"] - SIG["score_total"]["ci_low"]) / (2 * 1.96)
TOTAL_SD = _se * math.sqrt(NG)                       # mac basina paired fark std (CI'dan)
SEASON_SE = TOTAL_SD / math.sqrt(NG / NF)            # tek sezonun kayma payi
FULL_SEASON = 30 * 82 // 2
_HALF_LIVE = (CUR["brier_vs_elo"]["ci_high"] - CUR["brier_vs_elo"]["ci_low"]) / 2


def half_width(n):
    return _HALF_LIVE * math.sqrt(CUR["games"] / n)


# --- Brier ayristirmasi (8 olasilik diliminden) ---------------------------------------------
_bins = REL["bins"]
_n = sum(b["games"] for b in _bins)
_base = sum(b["games"] * b["observed"] for b in _bins) / _n
BR_UNC = _base * (1 - _base)
BR_RES = -sum(b["games"] * (b["observed"] - _base) ** 2 for b in _bins) / _n
BR_REL = sum(b["games"] * (b["mean_predicted"] - b["observed"]) ** 2 for b in _bins) / _n
BR_TOTAL = BR_UNC + BR_RES + BR_REL

# --- Defter ve is akisi sabitleri -----------------------------------------------------------
_wf = (ROOT / ".github/workflows/snapshot.yml").read_text()
_crons = re.findall(r'cron:\s*"([^"]+)"', _wf)
CRON_STEP = 60 // len(_crons[0].split()[0].split(","))
PRE_TIP = re.search(r"--pre-tip \"\$\{\{ inputs.pre_tip \|\| '(\d+)' \}\}\"", _wf).group(1)
SHIFT_COUNT = sum(p.read_text().count("shift(1)") for p in (ROOT / "src").rglob("*.py"))
_doc = (ROOT / "docs/reports/models/score_model.md").read_text()
_acc = re.search(r"Kazanan Dogrulugu\*\* \| \*\*%([\d.]+)\*\* \| %[\d.]+ \| %([\d.]+)", _doc)
SIGN_ACC = (_acc.group(1), _acc.group(2)) if _acc else None
_pipe = joblib.load(ROOT / "models/production/win_model.pkl")
WIN_COEF = dict(zip(WIN_FEATURES, _pipe.named_steps["clf"].coef_[0]))
PERM = {d["feature"]: d["loss_increase"] for d in WM["feature_guard"]["holdout_permutation_log_loss"]}
PLAYOFF_R = SM["prediction_interval_offsets_80pct_playoff"]["margin"][1]
PLAYOFF_N = SM["conformal_prediction_intervals"]["playoff_calibration_samples"]
THR = MANIFEST["promotion_thresholds"]
CAL = WM["model_selection_metrics_inner_holdout"]
FAMILY = WM["model_family_selection_fold_brier"]
HOLDOUT_GAMES = WM["split"]["test_rows"] // 2
MIN_BLOCKS = _bs.MIN_BLOCKS
BOOT_N = inspect.signature(_bs.paired_block_bootstrap).parameters["n_boot"].default
BOOT_N_AUC = inspect.signature(_bs.paired_block_bootstrap_auc).parameters["n_boot"].default
BOOT_SEED = inspect.signature(_bs.paired_block_bootstrap).parameters["seed"].default

_ty = sorted(re.search(r"(\d{4})_(\d{2})", Path(p).name).groups() for p in WM["row_counts_by_file"])
TRAIN_SEASONS = [f"{a}-{b}" for a, b in _ty]
TRAIN_FIRST, TRAIN_LAST = TRAIN_SEASONS[0], TRAIN_SEASONS[-1]
LCV = LC["curve"]
LC_GAINS = [r["brier_gain_vs_elo"] for r in LCV]
WARN = []


def check(cond, msg):
    """Anlatim metni bu varsayima dayaniyor; veri degisirse build sonunda uyari basilir."""
    if not cond:
        WARN.append(msg)


def fark(c, hb=False):
    ok = c["ci_low"] > 0 if hb else c["ci_high"] < 0
    return "Fark anlamlı" if ok else "Fark anlamlı değil"


def anl(c, hb=False):
    ok = c["ci_low"] > 0 if hb else c["ci_high"] < 0
    return "<b>Anlamlı</b>" if ok else "<b>Anlamlı değil</b>"


def includes0(c):
    return c["ci_low"] <= 0 <= c["ci_high"]


check(includes0(CUR["brier_vs_elo"]) and includes0(CUR["auc_vs_elo"]), "Canlı Brier/AUC farkı anlamlı hale geldi: ledger anlatımı gözden geçirilmeli")
check(SIG["win_brier"]["ci_high"] < 0 and SIG["win_auc"]["ci_low"] > 0, "Backtest WIN farkı artık anlamlı değil: anlatım gözden geçirilmeli")
check(includes0(SIG["score_total"]), "Toplam skor farkı anlamlı hale geldi: anlatım gözden geçirilmeli")
check(WINS_BRIER == NF, "WIN Brier tüm sezonlarda Elo'yu geçmiyor: anlatım gözden geçirilmeli")

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
pdfmetrics.registerFont(TTFont("Body", str(FONT_DIR / "Arial.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONT_DIR / "Arial Bold.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONT_DIR / "Arial Italic.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic")

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#52606d")
RULE = colors.HexColor("#d9dee3")
TINT = colors.HexColor("#f3f5f7")

H1 = ParagraphStyle("H1", fontName="Body-Bold", fontSize=22, leading=28, textColor=INK, spaceAfter=4)
SUB = ParagraphStyle("Sub", fontName="Body", fontSize=10.5, leading=15, textColor=MUTED, spaceAfter=18)
H2 = ParagraphStyle("H2", fontName="Body-Bold", fontSize=15, leading=20, textColor=INK, spaceBefore=6, spaceAfter=8)
H3 = ParagraphStyle("H3", fontName="Body-Bold", fontSize=11.5, leading=16, textColor=INK, spaceBefore=12, spaceAfter=4)
P = ParagraphStyle("P", fontName="Body", fontSize=10.5, leading=16, textColor=INK, alignment=TA_LEFT, spaceAfter=6)
PK = ParagraphStyle("PK", parent=P)
CELL = ParagraphStyle("Cell", parent=P, fontSize=10, leading=14, spaceAfter=0)
CELL_B = ParagraphStyle("CellB", parent=CELL, fontName="Body-Bold")
CALLOUT = ParagraphStyle("Callout", parent=P, fontSize=11, leading=17, spaceAfter=0)


_SECTION_NO = [0]


def H2N(title):
    """Numbered section heading; the counter follows build order."""
    _SECTION_NO[0] += 1
    return Paragraph(f"{_SECTION_NO[0]}. {title}", H2)


def callout(text):
    t = Table([[Paragraph(text, CALLOUT)]], colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TINT),
        ("LINEBEFORE", (0, 0), (0, -1), 3, INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return [Spacer(1, 4), t, Spacer(1, 8)]


def summary(text):
    return callout("<b>Özet:</b> " + text)


def table(rows, widths):
    data = [[Paragraph(c, CELL_B if i == 0 else CELL) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * cm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [t, Spacer(1, 8)]


def overview():
    wf = json.loads((ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json").read_text())
    aw, asr = wf["aggregate_win"], wf["aggregate_score"]
    s = [H2N("Projeye Genel Bakış")]
    s += callout("<b>Proje:</b> NBA maçları için üç ayrı tahmin modeli üreten ve bunları dürüstçe değerlendiren "
                 "bir veri hattı. Bu rapor, modellerin nasıl kurulduğunu ve her rakamın ne anlama geldiğini, "
                 "kavramları sıfırdan anlatarak açıklar.")

    s.append(Paragraph("Üç model", H3))
    s += table([
        ["Model", "Neyi tahmin ediyor", "Yöntem", "Ana ölçü"],
        ["WIN", "Ev sahibi takımın kazanma olasılığı", f"Lojistik Regresyon, {len(WIN_FEATURES)} özellik", "Brier, ROC-AUC"],
        ["SCORE", "Maçın toplam sayısı ve sayı farkı, ayrıca %80 aralık", "Ridge modelleri, OOF düzeltmesi, conformal aralık", "MAE"],
        ["PLAYER", "Oyuncunun sayı, ribaund ve asisti", f"LightGBM (L1 / medyan kaybı), {PM['features_count']} özellik", "MAE"],
    ], [2.2, 5.2, 5.6, 3.4])

    s.append(Paragraph("Veri nereden gelir, nasıl akar?", H3))
    s += table([
        ["Aşama", "Ne olur"],
        ["Veri toplama", "NBA'in resmi istatistikleri: takım ve oyuncu kutu skorları, maç programı, sakatlık raporu. "
                         f"{TRAIN_FIRST}'den bugüne sezon sezon saklanır."],
        ["Özellik üretimi", "Her özellik yalnızca o maçtan önceki bilgiyle hesaplanır (shift(1) kuralı). Eğitim ve canlı "
                            "hesapları arasındaki eşleşme (train-serve paritesi) testlerle denetlenir."],
        ["Eğitim ve seçim", "Zaman sırasına saygılı bölmelerle model ailesi seçilir. Terfi için kapılar vardır: yeni model "
                            "eskisinden kötü olamaz ve baseline'ı geçmelidir."],
        ["Değerlendirme", f"{NF} sezonluk walk-forward test, güçlü baseline'larla paired kıyas, bootstrap güven aralıkları."],
        ["Sunum", f"FastAPI servisi tahminleri üretir, React arayüzü gösterir. Güncel sürüm: {RELEASE}."],
        ["Canlı izleme", "2026-27 sezonu kilitlidir. Tahminler maçtan önce dondurulup deftere (paper ledger) yazılır."],
    ], [3.6, 12.8])

    s.append(Paragraph("Tek bakışta sonuçlar", H3))
    s += table([
        ["Ölçü", "Model", "Karşılaştırma", "Durum"],
        ["WIN Brier", f"{aw['production_brier']:.4f}", f"Elo {aw['elo_brier']:.4f}", f"{fark(SIG['win_brier'])}, {WINS_BRIER}/{NF} sezon"],
        ["WIN ROC-AUC", f"{aw['production_auc']:.4f}", f"Elo {aw['elo_auc']:.4f}", fark(SIG["win_auc"], True)],
        ["SCORE margin MAE", f"{asr['model_margin_mae']:.2f}", f"Son 10: {asr['baseline_margin_mae']:.2f}", fark(SIG["score_margin"])],
        ["SCORE toplam MAE", f"{asr['model_total_mae']:.2f}", f"Son 10: {asr['baseline_total_mae']:.2f}", fark(SIG["score_total"])],
        ["PLAYER PTS MAE", f"{AP['pts']['model_mae']:.2f}", f"EMA-10: {AP['pts']['baseline_mae']:.2f}", f"{fark(SIG['player_pts'])}, {WINS_PLAYER['pts']}/{NF} sezon"],
    ], [4.4, 3, 4.6, 4.4])
    s.append(Paragraph(
        f"Bu rakamlar {NF} sezonluk ({SEASONS_BT[0]} ile {SEASONS_BT[-1]}) walk-forward testten gelir: her sezon, yalnızca öncesindeki "
        "sezonlarla eğitilmiş bir modelle tahmin edilmiştir. Aşağıdaki bölümler önce ölçü araçlarını (kalibrasyon, Brier, "
        "log loss, ROC-AUC), sonra kıyas ve doğrulama yöntemlerini (baseline, Elo, walk-forward, bootstrap, canlı defter), "
        "sonra modelleri anlatır. Sondaki sözlük her terimi tek yerde toplar.", P))

    s.append(Paragraph("Raporu okurken akılda tutulacak üç fikir", H3))
    s += table([
        ["Fikir", "Anlamı"],
        ["Tek sayı yetmez", "Bir modelin iyi olup olmadığı, onun başarısına değil, basit bir yönteme göre farkına bakılarak anlaşılır."],
        ["Fark gerçek mi?", "Küçük bir fark şans olabilir. Bootstrap aralığı bu soruyu sayıyla cevaplar."],
        ["Dürüstlük", "Kazanç yoksa (örneğin toplam skorda) bu saklanmaz, rapora yazılır. Canlı sonuçlar da aynı şekilde raporlanır."],
    ], [4, 12.4])
    return s


def calibration():
    s = [PageBreak(), H2N("Kalibrasyon")]
    s += callout("<b>Kalibrasyon:</b> modelin verdiği olasılığın, gerçekleşen orana yakınlığı. "
                 "Model \"%70 olasılıkla kazanır\" dediği maçların <b>yüzde kaçı gerçekten kazanılmış</b>? "
                 "Yaklaşık %70 ise model kalibredir.")

    s.append(Paragraph("Hava durumu benzetmesi", H3))
    s.append(Paragraph(
        "Bir hava durumu uygulaması \"%70 olasılıkla yağmur yağar\" diyor. Bir yıl boyunca takip edip bu cümleyi "
        "kurduğu bütün günleri topluyorsun. Bu günlerin yüzde kaçında yağmur yağmış? Yaklaşık %70'inde "
        "yağmışsa uygulama <b>kalibre</b>dir. Yalnızca %40'ında yağmışsa uygulama abartıyordur.", P))

    s.append(Paragraph("Maça uyarlarsak", H3))
    s.append(Paragraph(
        "Model \"Lakers bu maçı %70 olasılıkla kazanır\" diyor. Modelin bu olasılığı verdiği 100 maçı bir araya "
        "getiriyoruz ve soruyoruz: bunların yüzde kaçında ev sahibi gerçekten kazanmış?", PK))
    s += table([
        ["Gerçekte kazanılan oran", "Anlamı"],
        ["%70", "Kalibre. Model dürüst."],
        ["%90", "Model fazla çekingen. Daha emin olabilirdi."],
        ["%50", "Model fazla iddialı. \"%70 olasılıkla\" diyor ama gerçekte yazı tura gibi."],
    ], [5, 11.4])

    s.append(Paragraph("Doğruluk (accuracy) neden yetmiyor?", H3))
    s.append(Paragraph(
        "İki model aynı maçlarda favoriyi doğru seçiyor, yani doğrulukları aynı. Ama biri hep \"%99\", "
        "diğeri \"%65\" diyor. Gerçekte favoriler %65 kazanıyorsa ilki yanlış bir güven veriyor, ikincisi "
        "belirsizliğini doğru söylüyor.", P))
    s += table([
        ["", "Model A", "Model B"],
        ["Söylediği", "%99 kazanır", "%65 kazanır"],
        ["Gerçekte favoriler", "%65 kazanıyor", "%65 kazanıyor"],
        ["Sonuç", "Kalibre değil", "Kalibre"],
    ], [4.4, 6, 6])
    s.append(Paragraph(
        "Olasılığı bir karar için kullanıyorsan (risk, bahis) güvenilir olması gerekir. "
        "\"%99\" gören biri büyük risk alır ve yanılınca çok kaybeder.", P))

    s.append(Paragraph("Nasıl kontrol edilir?", H3))
    s.append(Paragraph(
        "Tek bir maça bakılmaz. Modelin benzer olasılık verdiği maçlar bir gruba toplanır ve o grubun yüzde "
        "kaçının gerçekten kazanıldığına bakılır. Projeden gerçek değerler (5 sezon walk-forward, ev sahibi "
        "galibiyeti):", PK))
    _rb = {b["bin"]: b for b in REL["bins"]}

    def _relrow(k, lab):
        b = _rb[k]
        return [lab, tr(b["games"]), pc(b["mean_predicted"]), pc(b["observed"])]

    _gap = lambda k: abs(_rb[k]["mean_predicted"] - _rb[k]["observed"]) * 100
    s += table([
        ["Modelin verdiği olasılık", "Maç sayısı", "Ortalama olasılık", "Gerçekten kazanılan"],
        _relrow("0.7-0.8", "%70-80"),
        _relrow("0.8-1.0", "%80-100"),
        _relrow("0.4-0.5", "%40-50"),
    ], [4, 3.4, 4.6, 4.4])
    s.append(Paragraph(
        f"İlk iki satırda verilen olasılık ile gerçekten kazanılan oran arasındaki fark {_gap('0.7-0.8'):.1f} ve {_gap('0.8-1.0'):.1f} puan, yani "
        f"kalibre. Üçüncü satır zayıf: model ortalama {pc(_rb['0.4-0.5']['mean_predicted'], 0)} olasılık vermiş, gerçekte {pc(_rb['0.4-0.5']['observed'], 0)} kazanılmış "
        f"({_gap('0.4-0.5'):.1f} puan). Bu farkların tek sayıya özeti <b>ECE</b>'dir (bantlardaki sapmanın "
        f"maç sayısıyla ağırlıklı ortalaması). Bizim modelde <b>{REL['ece']:.4f}</b>, yani ortalama sapma yaklaşık {REL['ece'] * 100:.1f} puan; "
        "0'a ne kadar yakınsa o kadar iyi.", P))
    s.append(Paragraph(
        "<b>Brier skoru</b> bu kontrolü ayırt ediciliği de katarak tek sayıya sıkıştırır. Kalibre olmak tek başına "
        "iyi olmak değildir: her maça \"%50\" diyen model de kalibreye yakındır ama hiçbir şeyi ayırt etmez.", P))

    s.append(Paragraph("Canlı izlemeden gerçek bir örnek", H3))
    s.append(Paragraph(
        f"{SEASON} kilitli sezonunda maç öncesi dondurulan tahminler ({RELEASE}, {CUR['games']} canlı maç, {UPDATED} itibarıyla). Burada "
        "olasılık, modelin kazanır dediği takım için verilen olasılıktır:", PK))
    s += table([["Modelin verdiği olasılık", "Maç", "Ortalama olasılık", "Gerçekten kazanılan"]] +
               [["%" + b["label"][:-1], str(b["games"]), pc(b["mean_confidence"]), pc(b["accuracy"])] for b in CUR["bands"]],
               [4.4, 2.4, 4.6, 5])
    _lb = CUR["bands"][0]
    s.append(Paragraph(
        f"Okunuşu: {CUR['games']} maçta bantlar kabaca tutuyor mu diye bakılır. En düşük güven bandında (%{_lb['label'][:-1]}) yalnızca "
        f"{_lb['games']} maç var: model ortalama {pc(_lb['mean_confidence'])} demiş, {pc(_lb['accuracy'])} tutmuş. Bu kadar küçük bir "
        "örnekte tek bir bandın sapması şans olabilir; ara dönemlerde bu band bile çok daha uç değerler gösterebilir. "
        "Ders: küçük bantlarda tek sayıya bakıp hüküm vermemek, asıl olarak bütün bantların birlikte tutup tutmadığına bakmak gerekir.", P))

    s.append(Paragraph("Aynı tablo geçmiş 5 sezon için (sızıntısız walk-forward)", H3))
    s.append(Paragraph(
        f"Her sezon yalnızca öncesindeki sezonlarla eğitilmiş modelle tahmin edildi ({NGT} maç). Aşağıda canlı "
        "tabloyla aynı biçimde, favori denen takımın olasılığına göre bantlar. Sütunlar: modelin dediği / "
        "gerçekleşen.", PK))
    cc = CC
    labels = [b["label"] for b in cc["pooled"]["bands"]]
    rows = [["Sezon"] + [f"%{l[:-1]}" for l in labels] + ["ECE"]]
    live = {b["label"]: (b["mean_confidence"] * 100, b["accuracy"] * 100) for b in CUR["bands"]}
    def cell(b):
        return f"%{b['mean_confidence'] * 100:.1f} / %{b['accuracy'] * 100:.1f}"
    for season, tab in [*cc["by_season"].items(), ("5 sezon", cc["pooled"])]:
        by = {b["label"]: b for b in tab["bands"]}
        rows.append([season] + [cell(by[l]) if l in by else "-" for l in labels] + [f"{tab['ece'] * 100:.1f} puan"])
    rows.append([f"{SEASON} canlı"] + [f"%{live[l][0]:.1f} / %{live[l][1]:.1f}" if l in live else "-" for l in labels] + ["-"])
    s += table(rows, [2.6, 3.0, 3.0, 3.0, 3.0, 2.2])
    _p0 = cc["pooled"]["bands"][0]
    _by0 = {sn: next(b for b in t["bands"] if b["label"] == _p0["label"]) for sn, t in cc["by_season"].items()}
    _worst0 = min(_by0, key=lambda k: _by0[k]["accuracy"])
    _eces = {sn: t["ece"] * 100 for sn, t in cc["by_season"].items()}
    _worst_ece = max(_eces, key=_eces.get)
    s.append(Paragraph(
        f"Okunuşu: {NF} sezon boyunca %{_p0['label'][:-1]} bandında model ortalama {pc(_p0['mean_confidence'])} vermiş, gerçekte {pc(_p0['accuracy'])} kazanılmış. "
        f"Bu bandın en düşük gerçekleşen oranı {_worst0} sezonunda ({pc(_by0[_worst0]['accuracy'])}). "
        f"Sezonlar arasında ECE {min(_eces.values()):.1f} ile {max(_eces.values()):.1f} puan arasında değişiyor ({_worst_ece} en zayıf), yani tek bir sezon "
        "tek başına kesin bir hüküm vermez.", P))

    s.append(Paragraph("Dikkat: tek maç değil, toplu bakılır", H3))
    s.append(Paragraph(
        "Model bir maça \"%70 olasılıkla kazanır\" deyip o maçı kaybedebilir, bu yanlış demek değildir: %30'luk bir "
        "ihtimal zaten vardı. Kalibrasyon, bu olasılığı verdiği çok sayıda maçın yüzde kaçının kazanıldığına "
        "bakar.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        "WIN modeli sade bir lojistik regresyon. Bu tür modeller yüzdeleri genelde zaten iyi kalibre "
        "üretir, bu yüzden ek bir kalibrasyon katmanı kazanç getirmedi. Kalibrasyon düzeltmesi gerekseydi, "
        "sızıntıyı önlemek için modelin eğitim verisinde değil, katlamalı (out-of-fold) tahminlerde "
        "öğrenilirdi.", P))
    s += summary("Modelin verdiği olasılıklar uzun vadede gerçekleşme oranlarıyla örtüşüyor. Bu, doğrulukla değil, Brier skoru ve kalibrasyon tablosuyla doğrulanır.")
    return s


def brier():
    s = [PageBreak(), H2N("Brier Skoru")]
    s += callout("<b>Brier skoru:</b> modelin olasılık tahminlerinin gerçek sonuçlardan ortalama ne kadar "
                 "uzak olduğunu ölçen hata sayısı. Düşük olması iyidir.")

    s.append(Paragraph("Nasıl hesaplanır?", H3))
    s.append(Paragraph(
        "Her maç için modelin olasılığı ve gerçek sonuç var. Kazandıysa sonuç <b>1</b>, kaybettiyse <b>0</b>. "
        "Hata, aradaki farkın karesidir. Bütün maçların hatasının ortalaması Brier skorudur.", P))

    s.append(Paragraph("Üç maçlık örnek", H3))
    _bt = [(0.70, 1), (0.70, 0), (0.60, 1)]
    s += table([
        ["Maç", "Model dedi", "Gerçek", "Fark", "Hata (fark²)"],
        *[[str(i + 1), f"{p:.2f}", "1 (kazandı)" if y else "0 (kaybetti)", f"{abs(y - p):.2f}", f"{(y - p) ** 2:.2f}"] for i, (p, y) in enumerate(_bt)],
    ], [2, 3.6, 4, 3, 3.8])
    s.append(Paragraph(
        "Brier = (" + " + ".join(f"{(y - p) ** 2:.2f}" for p, y in _bt) + f") / {len(_bt)} = <b>{sum((y - p) ** 2 for p, y in _bt) / len(_bt):.3f}</b> (örnek girdilerle hesaplanmıştır)", P))
    s.append(Paragraph(
        f"Kare alınmasının sebebi büyük yanlışları daha sert cezalandırmaktır. {abs(0 - _bt[1][0]):.2f}'lik fark {(0 - _bt[1][0]) ** 2:.2f} ceza verirken "
        f"{abs(1 - _bt[0][0]):.2f}'luk fark sadece {(1 - _bt[0][0]) ** 2:.2f} verir. Yani \"çok emin ol ve yanıl\" en pahalı hatadır.", P))

    s.append(Paragraph("Sayı ne anlama geliyor?", H3))
    s += table([
        ["Strateji", "Brier"],
        ["Mükemmel model (hep doğru ve %100 emin)", f"{0.0:.3f}"],
        ["Bizim model (5 sezon ortalaması)", f"<b>{AW['production_brier']:.4f}</b>"],
        ["Saf Elo baseline", f"{AW['elo_brier']:.4f}"],
        ["Hep \"%50\" de (hiç bilgi yok)", f"{0.5 ** 2:.3f}"],
        ["Her maça \"%100\" deyip yarısında yanılan", f"{0.5 * 1.0 ** 2:.3f}"],
    ], [11.4, 5])
    s.append(Paragraph(
        f"{0.5 ** 2:.3f}, \"hiçbir şey bilmeme\" çizgisidir. Ondan aşağı inmek öğrenmiş olmak demektir. Bizim model {AW['production_brier']:.4f} ile bu çizginin "
        "altında ama mükemmel değerden de çok uzak: NBA'de tek maç doğası gereği çok gürültülü olduğu için 0'a yakın değerler gerçekçi değildir.", P))

    s.append(Paragraph("Neden doğruluk yerine Brier?", H3))
    s.append(Paragraph(
        "Doğruluk sadece \"favori kazandı mı\" diye bakar, %51 ile %99 aynı sayılır. Brier olasılığın kendisini "
        "değerlendirir: %99 deyip yanılan çok cezalanır, %51 deyip yanılan neredeyse hiç.", P))

    s.append(Paragraph("Kalibrasyonla bağlantısı", H3))
    s.append(Paragraph(
        "Kalibrasyon bir özellik, Brier ise bir puandır. Brier'in içinde kalibrasyon bir parça olarak yer alır. "
        "Brier üç parçadan oluşur:", PK))
    s += table([
        ["Parça", "Ne demek", "Brier'e etkisi"],
        ["Belirsizlik", f"Maçların doğal rastgeleliği, modelle ilgisi yok. NBA'de yaklaşık {BR_UNC:.2f}", "Sabit taban"],
        ["Ayrıştırma", "Farklı maçlara farklı olasılık verip kazananı kaybedenden ayırabilmek", "Düşürür (iyi)"],
        ["Kalibrasyon hatası", "Söylenen yüzde ile gerçek oran arasındaki fark", "Yükseltir (kötü)"],
    ], [3.6, 9.2, 3.6])
    s.append(Paragraph(
        "Örnek: bir grup maçta ev sahibi gerçekte %70 kazanıyor. İki model aynı maçları aynı gruba koyuyor, "
        "fark sadece söyledikleri yüzde:", PK))
    _q = 0.70
    _brier_of = lambda p: _q * (1 - p) ** 2 + (1 - _q) * p ** 2
    s += table([
        ["", "Dediği", "Gerçek", "Brier"],
        ["Model A", "%70", "%70", f"{_brier_of(0.70):.2f}"],
        ["Model B", "%90", "%70", f"{_brier_of(0.90):.2f}"],
    ], [4, 4, 4, 4.4])
    s.append(Paragraph(
        f"Aynı maçlar, aynı sıralama, sadece yüzde dürüst değil ve Brier {_brier_of(0.70):.2f}'den {_brier_of(0.90):.2f}'e çıkıyor. Fark {_brier_of(0.90) - _brier_of(0.70):.2f}, tam "
        "olarak (0.90 - 0.70)² yani söylenen ile gerçek arasındaki farkın karesi.", P))

    s.append(Paragraph("İyi kalibrasyon tek başına yetmez", H3))
    s += table([
        ["", "Kalibre", "Ayrıştırıyor", "Brier"],
        ["Hep %50 diyen model", "Evet", "Hayır", f"{0.5 ** 2:.2f} (kötü)"],
        ["Cesur ama abartan model", "Hayır", "Evet", "Orta"],
        ["<b>İyi model</b>", "<b>Evet</b>", "<b>Evet</b>", f"<b>~{AW['production_brier']:.2f}</b>"],
    ], [6, 3, 3.4, 4])
    s.append(Paragraph(
        "Kısacası kötü kalibrasyon Brier'i kötüleştirir, ama düşük Brier tek başına kalibrasyonu kanıtlamaz. "
        "Bunu görmek için yukarıdaki kontrol tablosuna ayrıca bakılır.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        f"WIN modeli {NF} sezon walk-forward testte Brier <b>{AW['production_brier']:.4f}</b> aldı, saf Elo baseline'ı {AW['elo_brier']:.4f}. Fark yaklaşık "
        f"{abs(SIG['win_brier']['mean_diff']):.3f}. Küçük görünür ama güven aralığı sıfırı içermiyor ({ci_txt(SIG['win_brier'])}) ve model {NF} sezonun {WINS_BRIER}'inde de "
        f"Elo'dan iyi. Elo zaten güçlü bir baseline olduğu için küçük ama tutarlı bir fark değerlidir. Parçalara "
        f"ayırınca ({len(REL['bins'])} olasılık dilimi, {tr(sum(b['games'] for b in REL['bins']))} maç): belirsizlik {BR_UNC:.4f}, ayrıştırma {BR_RES:.4f}, kalibrasyon hatası "
        f"{BR_REL:+.4f}, toplam yaklaşık {BR_TOTAL:.4f} (dilimleme ince ayrıntıyı kaybettirdiği için rapordaki {AW['production_brier']:.4f}'den biraz yüksek). "
        "Yani kazanç neredeyse tamamen ayrıştırmadan geliyor, kalibrasyon hatası ihmal edilebilir.", P))
    s += summary(f"Çıktı olasılık olduğu için doğruluk yerine Brier skoru ana metrik. Brier hem yüzdelerin dürüstlüğünü hem de maçları ayırt edebilmeyi ölçer. {0.5 ** 2:.2f} hiç bilgi olmayan çizgi, model {AW['production_brier']:.4f}, saf Elo {AW['elo_brier']:.4f}.")
    return s


def logloss():
    s = [PageBreak(), H2N("Log Loss")]
    s += callout("<b>Log loss:</b> Brier'e çok benzeyen ikinci bir hata sayısı. Farkı, kendinden emin olup "
                 "yanılmayı çok daha sert cezalandırmasıdır. Düşük olması iyidir.")

    s.append(Paragraph("Nasıl hesaplanır?", H3))
    s.append(Paragraph(
        "Brier, tahmin ile sonuç arasındaki farkın karesine bakıyordu. Log loss şuna bakar: <b>model, gerçekte "
        "olan şeye ne kadar olasılık vermişti?</b> Hata, -ln(gerçekleşen sonuca verilen olasılık) olarak "
        "hesaplanır, sonra maçların ortalaması alınır. (ln, hesap makinesindeki doğal logaritma tuşudur. "
        "Detayı bilmek gerekmez, aşağıdaki tabloyu okumak yeter.)", P))

    s.append(Paragraph("Üç maçlık örnek (Brier'dekiyle aynı)", H3))
    _lt = [(0.70, 1), (0.70, 0), (0.60, 1)]
    _pt = [p if y else 1 - p for p, y in _lt]
    s += table([
        ["Maç", "Model dedi", "Gerçek", "Gerçeğe verilen olasılık", "Hata"],
        *[[str(i + 1), f"%{round(p * 100)} kazanır", "kazandı" if y else "kaybetti", f"{q:.2f}", f"{-math.log(q):.3f}"] for i, ((p, y), q) in enumerate(zip(_lt, _pt))],
    ], [1.6, 3.6, 3, 5, 3.2])
    s.append(Paragraph("Log loss = (" + " + ".join(f"{-math.log(q):.3f}" for q in _pt) + f") / {len(_pt)} = <b>{sum(-math.log(q) for q in _pt) / len(_pt):.3f}</b> (örnek girdilerle hesaplanmıştır)", P))
    s.append(Paragraph(
        f"Maç 2'de model kaybeden tarafa %{round(_pt[1] * 100)} vermişti, yani olanı düşük ihtimal saymıştı. Hata büyük.", P))

    s.append(Paragraph("Asıl fark: aşırı özgüven cezası", H3))
    s.append(Paragraph("Model bir tarafa \"kazanır\" dedi ve o taraf <b>kaybetti</b>. Tek maçta alınan ceza:", PK))
    s += table([
        ["Modelin verdiği olasılık", "Brier cezası", "Log loss cezası"],
        *[[f"%{round(p * 100)}", f"{p ** 2:.2f}", f"{-math.log(1 - p):.2f}"] for p in (0.5, 0.6, 0.7, 0.9)],
        ["%99", f"{0.99 ** 2:.2f}", f"<b>{-math.log(1 - 0.99):.2f}</b>"],
        ["%100", f"{1.0:.2f}", "<b>sonsuz</b>"],
    ], [6, 5, 5.4])
    s.append(Paragraph(
        f"Brier'in tek maçtaki cezası en fazla 1'dir. Log loss'ta sınır yoktur: %99 deyip yanılmak %90 deyip "
        f"yanılmanın {math.log(1 - 0.99) / math.log(1 - 0.90):.0f} katı pahalıdır, \"kesin\" deyip yanılmak ise sonsuz. Yani log loss \"asla %100 deme\" "
        "diyen bir ölçüdür.", P))

    s.append(Paragraph("Sayı ne anlama geliyor?", H3))
    s += table([
        ["Strateji", "Log loss"],
        ["Mükemmel model", f"{0.0:.3f}"],
        ["Bizim model (5 sezon ortalaması)", f"<b>{AUD['production']['log_loss']:.4f}</b>"],
        ["Saf Elo baseline", f"{AUD['elo']['log_loss']:.4f}"],
        ["Hep \"%50\" de (hiç bilgi yok)", f"{math.log(2):.3f}"],
    ], [11.4, 5])
    s.append(Paragraph(f"Brier'deki {0.5 ** 2:.3f} çizgisinin karşılığı burada {math.log(2):.3f}'tür. Altına inmek öğrenmiş olmak demektir.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        "Lojistik regresyon eğitilirken zaten log loss'u küçülterek öğrenir. Bu yüzden eğitim kriteri ile "
        "ölçtüğümüz metrik aynı ailedendir ve yüzdeler doğal olarak kalibre çıkar. \"Ek kalibrasyon gerekmedi\" "
        "demenin sebebi budur. Ana rapor sayımız Brier, log loss ise yardımcı kontroldür.", P))
    s += summary(f"Log loss da Brier gibi olasılığın dürüstlüğünü puanlar, ama kendinden emin yanlışları çok daha sert cezalandırır. Model {AUD['production']['log_loss']:.4f}, hiç bilgi olmayan çizgi {math.log(2):.3f}.")
    return s


def connection():
    s = [Spacer(1, 10), H2N("Kalibrasyon, Brier ve Log Loss: Bağlantı")]
    s += callout("Kalibrasyon bir <b>özellik</b>, Brier ve log loss bu özelliği (ayrıştırmayla birlikte) "
                 "ölçen iki <b>puandır</b>. Üçü de aynı soruya bakar: model olasılığı dürüstçe söylüyor mu?")

    s.append(Paragraph("Tek bakışta", H3))
    s += table([
        ["", "Kalibrasyon", "Brier", "Log loss"],
        ["Ne o?", "Yüzdeler gerçekle tutuyor mu", "Hata karesinin ortalaması", "Gerçeğe verilen olasılığın -ln'i"],
        ["Tür", "Özellik", "Puan", "Puan"],
        ["Tek sayı mı?", "Hayır, tabloyla görülür", "Evet", "Evet"],
        ["Hiç bilgi yok çizgisi", "-", f"{0.5 ** 2:.3f}", f"{math.log(2):.3f}"],
        ["Bizim model", "İyi (ek düzeltme gerekmedi)", f"{AW['production_brier']:.4f}", f"{AUD['production']['log_loss']:.4f}"],
        ["Uç yanlışlara", "-", "Sert", "Çok daha sert"],
    ], [3.6, 4.6, 4, 4.2])

    s.append(Paragraph("Kim kimi etkiliyor?", H3))
    s += table([
        ["Durum", "Kalibrasyon", "Brier", "Log loss"],
        ["Yüzdeler abartılı ya da çekingen", "Bozulur", "Kötüleşir", "Kötüleşir (uçlarda çok)"],
        ["Maçları iyi ayırıyor", "Etkilemez", "İyileşir", "İyileşir"],
        ["Hep %50 diyor", "Kalibre", f"{0.5 ** 2:.3f}", f"{math.log(2):.3f}"],
    ], [6, 3.2, 3.2, 4])
    s.append(Paragraph(
        "Kalibrasyon bozulursa iki puan da kötüleşir. Ama düşük puan tek başına kalibrasyonu kanıtlamaz, çünkü "
        "içinde ayrıştırma da vardır. Kalibrasyonu görmek için kontrol tablosuna ayrıca bakılır.", P))

    s.append(Paragraph("Hangisini ne için kullanıyoruz?", H3))
    s += table([
        ["Soru", "Bakılan şey"],
        ["Yüzdeler dürüst mü?", "Kalibrasyon tablosu"],
        ["Genel olarak ne kadar iyi?", "Brier (ana rapor sayısı)"],
        ["Uçlarda aşırı iddialı mı?", "Log loss (yardımcı kontrol)"],
        ["Maçları birbirinden ayırabiliyor mu?", "ROC-AUC (yardımcı ölçü, kalibrasyonu görmez)"],
        ["İkisi aynı yönü gösteriyor mu?", "Evet ise güven artar, değilse uç tahminlerde sorun vardır"],
    ], [7, 9.4])
    s += summary("Üç ölçü aynı soruyu farklı açıdan sorar: yüzdeler dürüst mü, maçlar birbirinden ayrılabiliyor mu, aşırı özgüvenli hatalar var mı.")
    return s


def baseline():
    s = [PageBreak(), H2N("Baseline")]
    s += callout("<b>Baseline:</b> akıllı bir model kurmadan, basit ve bedava bir yöntemle ne elde edilirdi? "
                 "Modelin değeri, bu yöntemle aradaki farktır.")

    s.append(Paragraph("Neden gerekli?", H3))
    s.append(Paragraph(
        f"\"Brier {AW['production_brier']:.4f}\" tek başına bir şey söylemez. İyi mi kötü mü? Aynı maçlarda basit bir yöntem {AW['elo_brier']:.4f} "
        "veriyorsa model gerçekten bir şey öğrenmiştir. Kıyas yoksa \"iyi\" kelimesi boş kalır.", P))

    s.append(Paragraph("İyi ve kötü baseline", H3))
    s += table([
        ["", "Kötü baseline", "İyi baseline"],
        ["Örnek", "\"Hep ev sahibi kazanır\" de", "Elo"],
        ["Sorun", "Çok kolay yenilir, kendini kandırırsın", "Güçlüdür, geçmek zordur"],
        ["Anlamı", "Kazansan da bir şey kanıtlamaz", "Geçersen gerçek değer üretmişsindir"],
    ], [2.6, 6.8, 7])
    s.append(Paragraph(
        "Bu projede eskiden zayıf baseline'lar vardı. Güçlü olanlarla (Elo, son 10 maç, EMA-10) değiştirildi, "
        "yani başarı daha zor bir sınavla ölçülüyor.", P))

    s.append(Paragraph("Projedeki üç baseline", H3))
    s += table([
        ["Model", "Baseline", "Fikri"],
        ["WIN", "Saf Elo + ev sahibi avantajı", "Sadece takım güç puanı"],
        ["SCORE", "Son 10 maçın ortalama sayısı", "\"Son zamanlarda ne attıysa onu atar\""],
        ["PLAYER", "EMA-10", "Oyuncunun yakın formu"],
    ], [2.6, 6.8, 7])

    s.append(Paragraph("Gerçek sonuçlar: model baseline'a karşı", H3))
    s.append(Paragraph(
        f"{NF} sezonluk walk-forward test ({SEASONS_BT[0]} ile {SEASONS_BT[-1]}, {NGT} görülmemiş maç). Kaynak: "
        "<font name=\"Body-Italic\">reports/evaluation/multi_season_walk_forward_backtest.md</font>.", PK))
    def _ev(c, w=None):
        return ("Evet" if c["ci_high"] < 0 else "Hayır") + (f", {w}/{NF} sezon" if w is not None else "")
    _wll = wins(lambda f: f["win"]["production"]["log_loss"] < f["win"]["pregame_elo"]["log_loss"])
    s += table([
        ["Metrik", "Model", "Baseline", "Fark anlamlı mı?"],
        ["WIN Brier (düşük iyi)", f"{AW['production_brier']:.4f}", f"Elo {AW['elo_brier']:.4f}", _ev(SIG["win_brier"], WINS_BRIER)],
        ["WIN log loss", f"{AUD['production']['log_loss']:.4f}", f"Elo {AUD['elo']['log_loss']:.4f}", f"{_wll}/{NF} sezon (model önde)"],
        ["WIN doğruluk", pc(AW["production_accuracy"], 2), f"Elo {pc(AW['elo_accuracy'], 2)}", "-"],
        ["Margin MAE (sayı)", f"{AS['model_margin_mae']:.2f}", f"Son 10: {AS['baseline_margin_mae']:.2f}", _ev(SIG["score_margin"], WINS_MARGIN)],
        ["Total MAE (sayı)", f"{AS['model_total_mae']:.2f}", f"Son 10: {AS['baseline_total_mae']:.2f}", "<b>" + _ev(SIG["score_total"], WINS_TOTAL) + "</b>"],
        ["PTS MAE", f"{AP['pts']['model_mae']:.2f}", f"EMA-10: {AP['pts']['baseline_mae']:.2f}", f"{WINS_PLAYER['pts']}/{NF} sezon"],
    ], [4.6, 3, 4.4, 4.4])
    s.append(Paragraph(
        "Dürüst okuma: WIN için fark küçük ama tutarlı. Toplam skorda model baseline'dan ayrışmıyor, bu "
        f"saklanmıyor, rapora yazılıyor. {SEASON} canlı örneği henüz küçük, {LEDGER_MIN_GAMES} maçta yeniden "
        "bakılacak.", P))
    s += summary(f"Model, güçlü baseline'larla kıyaslanır: galibiyette saf Elo, skorda son 10 maç ortalaması, oyuncuda EMA-10. WIN'de Elo {WINS_BRIER}/{NF} sezonda geçilir. Toplam skorda baseline'dan anlamlı ayrışma yoktur ve bu açıkça raporlanır.")
    return s


def elo():
    s = [Spacer(1, 10), H2N("Elo")]
    s += callout("<b>Elo:</b> her takıma tek bir güç puanı veren ve bu puanı her maç sonucuyla güncelleyen "
                 "sistem. Satrançtaki reyting sistemiyle aynı mantık.")

    s.append(Paragraph("Nasıl çalışır?", H3))
    s.append(Paragraph(
        f"1) Her takım aynı puanla başlar (projede {ELO0:.0f}). 2) Maçtan önce puan farkına bakılır, fark büyüdükçe "
        "güçlü takımın kazanma ihtimali artar. 3) Maç oynanır. Beklenmedik sonuç puanı çok, beklenen sonuç az "
        "değiştirir. 4) Kazanan puan alır, kaybeden aynı miktarda kaybeder.", P))

    s.append(Paragraph("Elo neden güçlü baseline?", H3))
    s.append(Paragraph(
        "Sadece geçmiş sonuçlardan öğrenir ve takım gücünü tek puana sıkıştırır. NBA'de tek başına bile "
        f"{pc(AW['elo_accuracy'], 0)} doğruluk ve {AW['elo_brier']:.4f} Brier verir. Üstüne bir şey eklemek zordur, çünkü takım gücü bilgisinin çoğunu "
        "zaten taşır. Modelimiz Elo'ya dinlenme, back-to-back ve rotasyon bilgisi ekler, kazanç bu yüzden küçük "
        "ama tutarlıdır.", P))
    s.append(Paragraph("Puan farkı kaç yüzde eder?", H3))
    s += table([
        ["Elo farkı", "Güçlü takımın kazanma ihtimali"],
        *[[str(d), pc(elo_prob(d), 0)] for d in (0, 100, 200)],
    ], [5, 11.4])
    s.append(Paragraph(
        f"Ev sahibi takımın puanına ayrıca +{HCA:.0f} eklenir (ev sahibi avantajı). Formül: "
        "olasılık = 1 / (1 + 10<super>-fark/400</super>).", P))

    s.append(Paragraph("Projenin Elo ayarları", H3))
    s += table([
        ["Ayar", "Değer", "Ne işe yarar"],
        ["Başlangıç puanı", f"{ELO0:.0f}", "Herkesin ortak çıkış noktası"],
        ["K katsayısı", f"{K_ELO:.0f}", "Tek maçın puanı ne kadar oynattığı"],
        ["Ev sahibi avantajı", f"+{HCA:.0f} puan", f"Ev sahipleri {SEASON} canlıda maçların {pc(CUR['home_win_rate'])}'ini kazandı"],
        ["Sezon geçişi", f"{CARRY}", f"Yeni sezonda puanlar {ELO0:.0f}'e doğru kısmen geri çekilir (kadrolar değişir)"],
        ["Marj çarpanı (MOV)", f"{MOV_LO} ile {MOV_HI} arası", "Büyük farkla kazanmak puanı daha çok oynatır, favorinin farkı ise az"],
    ], [4, 3.4, 9])
    s.append(Paragraph(
        "K, ev sahibi avantajı ve sezon geçişi kendi geçmiş verimizde grid ile ayarlandı: eski ayarlar "
        f"(K={ELO_GRID['k']}, avantaj {ELO_GRID['hca']}, geçiş {ELO_GRID['carry']}) {ELO_GRID['old']} log loss verirken yeni ayar {ELO_GRID['new']} verdi. Yani baseline'ın kendisi "
        "de güçlendirildi, bu da modeli geçmeyi zorlaştırır.", P))

    s.append(Paragraph(f"Gerçek örnek 1: {SEASON} açılış puanları", H3))
    s += table([
        ["En yüksek", "Puan", "En düşük", "Puan"],
        *[[a, f"{OPEN[a]:.0f}", b, f"{OPEN[b]:.0f}"] for (a, _), (b, _) in zip(OPEN_TOP, OPEN_BOT)],
    ], [4, 4, 4, 4.4])
    s.append(Paragraph(f"En üst ile en alttaki takım arasında yaklaşık {OPEN_SPREAD:.0f} puan fark var.", P))

    _fg = FG
    _won, _exp = _fg["won"], _fg["exp"]
    _upset = (_won == 1.0) != (_exp > 0.5)
    _pact = _exp if _won == 1.0 else 1 - _exp
    s.append(Paragraph("Gerçek örnek 2: sezonun ilk maçının baştan sona hesabı", H3))
    s.append(Paragraph(
        f"{tr_date(_fg['date'])} {_fg['date'][:4]}, sezonun ilk günü: {_fg['home']} (ev sahibi) - {_fg['away']}. Bu hesap, "
        "projenin Elo motorunun çıktısıyla karşılaştırılarak doğrulanır (rapor üretilirken kontrol edilir).", PK))
    s += table([
        ["Adım", "Değer"],
        [f"{_fg['home']} açılış puanı", f"{_fg['he']:.2f}"],
        [f"{_fg['away']} açılış puanı", f"{_fg['ae']:.2f}"],
        ["Ev sahibi avantajı eklenince fark", f"{_fg['he']:.2f} + {HCA:.0f} - {_fg['ae']:.2f} = {_fg['diff']:.2f}"],
        [f"Elo'nun verdiği {_fg['home']} kazanma ihtimali", pc(_exp)],
        ["Gerçek sonuç", f"{_fg['home']} {_fg['hp']} - {_fg['away']} {_fg['ap']}" + (" (sürpriz)" if _upset else " (beklenen sonuç)")],
        ["Bu maçın Brier hatası (Elo)", f"({_exp:.3f} - {_won:.0f})² = {(_exp - _won) ** 2:.3f}"],
        ["Bu maçın log loss hatası (Elo)", f"-ln({_pact:.3f}) = {-math.log(_pact):.3f}"],
        ["Marj çarpanı", f"{_fg['mult']:.2f} ({'sürpriz' if _upset else 'beklenen sonuç'}, {abs(_fg['margin']):.0f} sayı fark)"],
        ["Puan değişimi", f"{K_ELO:.0f} x {_fg['mult']:.2f} x ({_won:.0f} - {_exp:.3f}) = {_fg['shift']:+.1f}"],
        ["Yeni puanlar", f"{_fg['home']} {_fg['he'] + _fg['shift']:.1f}, {_fg['away']} {_fg['ae'] - _fg['shift']:.1f}"],
    ], [7.4, 9])
    s.append(Paragraph(
        f"Marj çarpanı olmasaydı değişim yalnızca {_fg['plain_shift']:+.1f} olurdu. Sürpriz sonuçlar sistemi daha çok oynatır, beklenen sonuçlar daha az.", P))

    def _ex_row(r):
        return [f"{tr_date(r['game_date'])}, {r['home_team']} - {r['away_team']}", pc(r["pe"]), pc(r["pm"]),
                f"{r['actual_winner']} {abs(r['actual_margin']):.0f} farkla kazandı", f"{(r['pm'] - r['y']) ** 2:.3f} / {(r['pe'] - r['y']) ** 2:.3f}"]
    s.append(Paragraph("Gerçek örnek 3: Elo ile model ayrıştığında", H3))
    s.append(Paragraph(
        f"{SEASON} canlı ledger'ında, maç başlamadan dondurulmuş {RELEASE} tahminleri arasında Brier farkı en büyük olan iki maç. "
        "Biri modelin, diğeri Elo'nun lehine. Olasılıklar ev sahibinin kazanma ihtimalidir.", PK))
    s += table([
        ["Maç (ev sahibi önce)", "Elo", "Model", "Sonuç", "Brier: model / Elo"],
        _ex_row(EX_MODEL),
        _ex_row(EX_ELO),
    ], [4.2, 1.8, 2, 4.8, 3.6])
    s.append(Paragraph(
        "Tek maç hiçbir şey kanıtlamaz: model birinde Elo'dan çok daha iyi, diğerinde çok daha kötü. Önemli olan yüzlerce "
        "maçın ortalaması ve güven aralığıdır, yani bir sonraki konu.", P))

    s += summary(f"Elo, takım gücünü tek puanla tutan ve her maçta güncelleyen güçlü bir baseline. Ayarları grid ile güçlendirildi. Model onu {WINS_BRIER}/{NF} sezonda Brier'de geçer, ama fark küçüktür, çünkü Elo takım gücü bilgisinin çoğunu zaten taşır.")
    return s


def walk_forward():
    s = [PageBreak(), H2N("Walk-Forward ve Veri Sızıntısı")]
    s += callout("<b>Veri sızıntısı:</b> modelin, gerçek hayatta o anda bilemeyeceği bir bilgiyi görmesi. "
                 "<b>Walk-forward:</b> zamanı gerçek sırasıyla oynamak, yani her zaman sadece geçmişle eğitip "
                 "hemen sonraki dönemi test etmek.")

    s.append(Paragraph("Sızıntı: sınavda cevap anahtarını görmek", H3))
    s.append(Paragraph(
        "Bir sınavda cevap anahtarını gizlice gören birinin notu 100 çıkar ama bu, konuyu gerçekten öğrendiği "
        "anlamına gelmez. Sızıntılı model de backtestte harika görünür, canlıda çöker.", P))
    s += table([
        ["Sızıntı türü", "Örnek", "Sonuç"],
        ["Maçın kendisini istatistiğe katmak", "\"Son 10 maç ortalaması\" hesabına bugünkü maçı da dahil etmek",
         "Model sonucu zaten görmüştür"],
        ["Rastgele bölme", "Maçları karıştırıp %80 eğitim, %20 test yapmak",
         "Gelecekteki maç eğitimde, geçmiştekiler testte kalabilir"],
        ["Aynı veride kalibrasyon", "Modeli ve kalibrasyonu aynı veride öğrenmek",
         "Kalibrasyon olduğundan iyi görünür"],
        ["Test setine bakarak ayar", "Hiperparametreyi test sonucuna göre seçmek",
         "Test artık \"görülmemiş\" değildir"],
    ], [4.4, 6.4, 5.6])

    s.append(Paragraph("Walk-forward: projedeki beş katlama", H3))
    s.append(Paragraph(
        "Eğitim penceresi her adımda büyür (expanding window). Her sezonun sonucu, o sezonu hiç görmemiş bir "
        "modelden gelir.", PK))
    s += table([
        ["Katlama", "Eğitim", "Test", "Test maçı"],
        *[[str(f["fold"]), " ile ".join(f["train_seasons"]) if len(f["train_seasons"]) < 3 else f"{f['train_seasons'][0]} .. {f['train_seasons'][-1]}",
           f["test_season"], tr(f["test_games"])] for f in FOLDS],
    ], [2.4, 6.4, 3.8, 3.8])
    s.append(Paragraph(
        f"Toplam {NGT} görülmemiş maç. Rastgele bölmede model gelecekteki maçla eğitilip geçmişi tahmin "
        "edebilir, walk-forward bunu engeller.", P))

    s.append(Paragraph("Projede sızıntıyı nasıl engelledik?", H3))
    s += table([
        ["Önlem", "Ne yapıyor"],
        ["shift(1)", f"Takım ve oyuncu istatistikleri bir maç geriye kaydırılarak hesaplanır. Kaynak kodda shift(1) {SHIFT_COUNT} yerde "
                     "geçiyor, bir maçın özelliği o maçın kendi sonucunu içeremez."],
        ["OOF kalibrasyon", "Kalibrasyon, eğitim verisi içinde zaman sıralı parçalara bölünerek (out-of-fold) "
                            "öğrenilir. Model kendi tahminleriyle kalibre edilmez."],
        ["Sızıntı testleri", "Örneğin bu gecenin gerçek dakikalarının özelliklere karışmadığını kontrol eder."],
        ["Kilitli sezon", "2026-27, model eğitimi, hiperparametre ve özellik seçiminde hiç kullanılmaz."],
    ], [4, 12.4])

    s.append(Paragraph("Gerçek bir hata hikâyesi: train-serve skew", H3))
    s.append(Paragraph(
        "Sızıntının kuzeni: özellik eğitimde bir şekilde, canlıda başka şekilde hesaplanıyor. Projede bulduğumuz "
        "örnek: playoff maçlarında <b>IS_PLAYOFF</b> hep 0 dönüyordu, çünkü başka sütunlar onu gölgeliyordu. "
        "Eğitimde doğruydu, canlıda yanlıştı. Sonuç: canlı toplam skor tahminleri sistematik olarak yüksekti.", P))
    s.append(Paragraph(
        "Bu tek hata, offline ile canlı tahminler arasındaki farkın neredeyse tamamını açıklıyordu. Bu yüzden eğitim ve canlı "
        "hesaplarını karşılaştıran parite testleri tutuyoruz. (Düzeltme öncesi ölçümlerin betikleri saklanmadığı için "
        "burada sayı verilmez.)", P))

    s.append(Paragraph("Dürüst sınırlar", H3))
    s += table([
        ["Sınır", "Ne anlama geliyor"],
        ["Aynı katlamalara tekrar tekrar baktık",
         "Özellik ve model kararlarını 2021-22 ile 2025-26 sonuçlarına bakarak verdik. Bu, sonuçları hafif "
         "iyimser yapabilir. Bu yüzden 2026-27 kilitli: gerçekten dokunulmamış bir sınav."],
        ["Elo ayarları tüm geçmişte yapıldı",
         "K, ev sahibi avantajı ve sezon geçişi 2020-21 ile 2025-26 üzerinde seçildi. Elo aynı zamanda modelin "
         "özelliği (ELO_DIFF) olduğu için bu ayar hem baseline'a hem modele yarar. Etkinin yönü belirsiz, "
         "kilitli sezon bu yüzden önemli."],
        ["\"Kimin oynamadığı\" bilgisi",
         "Backtestte kadro eksikliği o maçın kendi kaydından, canlıda sakatlık raporundan ve \"önceki maçta "
         "oynayan oynar\" varsayımından geliyor. WIN kazancının büyük kısmı bu özelliklerden. Aşağıda ölçülmüştür."],
        ["Sakatlık raporu eşleşmesi",
         "Rapordaki bazı oyuncular kimlikle eşleşmiyor: maç kaydı henüz olmayan çaylaklar, takas edilmiş oyuncular, isim "
         "ayrıştırma hataları. Takas edilen oyuncu yeni takımda oynayana kadar rotasyona girmiyor, eğitimde de öyle; yani "
         "tutarlı ama o oyuncunun OUT bilgisi kullanılmıyor."],
    ], [5, 11.4])

    s.append(Paragraph("Kadro bilgisi: kazancın ne kadarı canlıda kalıyor?", H3))
    s.append(Paragraph(
        f"Aynı walk-forward farklı kadro varsayımlarıyla çalıştırıldı ({NGT} maç). \"Canlı varsayım\" sakatlık "
        "raporunu içermez, yani canlıda elde edilecek bilginin alt sınırıdır.", PK))
    _ad = {k: v["brier"] - AUD["elo"]["brier"] for k, v in AUD.items()}
    _ar = lambda k, lab: [lab, f"{AUD[k]['brier']:.4f}", f"{AUD[k]['log_loss']:.4f}", f"{_ad[k]:+.4f}" if k != "elo" else "-"]
    s += table([
        ["Varyant", "Brier", "Log loss", "Elo'ya fark"],
        _ar("production", "Maç kaydındaki gerçek kadro (rapor rakamı)"),
        _ar("live_like_serve", "Aynı model, canlı varsayımla test"),
        _ar("live_like_retrain", "Canlı varsayımla yeniden eğitilmiş"),
        _ar("no_availability", "Kadro özellikleri hiç yok"),
        _ar("elo", "Saf Elo"),
    ], [7.4, 2.6, 2.8, 3.6])
    s.append(Paragraph(
        f"Gerçek kadro bilgisiyle kazanç {_ad['production']:+.4f} görünüyor, ama bu bilgi maç bitmeden bilinmiyor. Canlı varsayımla "
        f"kazanç yaklaşık {_ad['live_like_serve']:+.4f} ile {_ad['live_like_retrain']:+.4f} arasına iniyor; ilki için %95 aralık {ci_txt(SIG['win_brier_live_like'])}, yani Elo'yu "
        "hâlâ geçiyor ama marjinal. Sakatlık raporu bu farkın bir kısmını geri getiriyor; ne kadarını, canlı "
        "defter büyüdükçe görülecek.", P))
    check(SIG["win_brier_live_like"]["ci_high"] < 0, "Canlı varsayımlı WIN kazancı artık anlamlı değil: anlatım gözden geçirilmeli")
    s += summary(f"Rastgele bölme yerine expanding-window walk-forward kullanılır: her sezon yalnızca önceki sezonlarla eğitilmiş modelle test edilir ({NGT} görülmemiş maç). Özellikler shift(1) ile, kalibrasyon OOF ile üretilir. Aynı katlamalara tekrar bakıldığı için {SEASON} kilitlendi ve tahminler maç öncesi dondurulur. Kadro özellikleri canlıdaki gibi yalnızca önceki maçtan türetilince Elo karşısındaki kazanç {abs(_ad['production']):.4f}'dan {abs(_ad['live_like_serve']):.4f}'ye iner: hâlâ anlamlı ama küçük.")
    return s


def bootstrap():
    s = [PageBreak(), H2N("Bootstrap Güven Aralığı")]
    s += callout("<b>Soru:</b> modelin baseline'a karşı farkı gerçek mi, yoksa şanslı bir örnek mi? "
                 "<b>Bootstrap:</b> aynı veriyi yapay olarak tekrar tekrar \"yeniden oynayıp\" farkın ne kadar "
                 "oynadığına bakmak. Yeni veri toplamaya gerek yoktur.")

    s.append(Paragraph("Nasıl çalışır?", H3))
    s += table([
        ["Adım", "Ne yapılır"],
        ["1", "Her maç için fark hesaplanır: model hatası eksi baseline hatası"],
        ["2", "Bu listeden yerine koyarak rastgele yeniden örnekleme yapılır. Aynı gün birden çok kez çıkabilir, "
              "bazı günler hiç çıkmayabilir"],
        ["3", "Her yeniden örneklemede farkın ortalaması hesaplanır"],
        ["4", f"Bu {tr(BOOT_N)} kez tekrarlanır, elde {tr(BOOT_N)} \"alternatif gerçeklik\" olur"],
        ["5", f"Bu {tr(BOOT_N)} ortalamanın ortadaki %95'i, %95 güven aralığıdır"],
    ], [2, 14.4])

    s.append(Paragraph("Küçük bir örnek: 8 maç günü", H3))
    s.append(Paragraph(
        "Diyelim ki model ile baseline'ın 8 maç günündeki ortalama Brier farkı (model eksi baseline) aşağıdaki gibi. "
        "Negatif değer, o gün modelin daha iyi olduğunu gösterir.", PK))
    _days = np.array([-0.02, 0.01, -0.03, -0.01, 0.02, -0.04, -0.02, 0.00])
    _picks = [[3, 3, 6, 1, 8, 2, 6, 5], [5, 5, 2, 8, 5, 4, 2, 1], [6, 7, 6, 3, 4, 7, 1, 6]]
    rows = [["Gün"] + [str(i) for i in range(1, 9)] + ["Ortalama"],
            ["Fark"] + [f"{v:+.2f}" for v in _days] + [f"<b>{_days.mean():+.4f}</b>"]]
    s += table(rows, [1.8] + [1.35] * 8 + [2.2])
    s.append(Paragraph(
        f"Bu 8 günün ortalaması {_days.mean():+.4f}: model biraz iyi görünüyor. Ama bu sekiz gün şanslı bir dizi olabilir. "
        f"Bootstrap, aynı sekiz günden yerine koyarak yeni diziler çeker (bir gün birden çok kez çıkabilir, bazı "
        "günler hiç çıkmayabilir) ve her dizinin ortalamasına bakar:", P))
    rows = [["Deneme", "Çekilen günler", "Dizinin ortalaması"]]
    for i, pk in enumerate(_picks, 1):
        rows.append([str(i), ", ".join(map(str, pk)), f"{_days[np.array(pk) - 1].mean():+.4f}"])
    rows.append(["...", "bu işlem binlerce kez tekrarlanır", "..."])
    s += table(rows, [2.4, 8, 6])
    _pm = [_days[np.array(pk) - 1].mean() for pk in _picks]
    check(_pm[1] > 0, "Bootstrap örneğinde ikinci denemenin ortalaması pozitif olmalı (anlatım buna dayanır)")
    s.append(Paragraph(
        f"İkinci denemede ortalama {_pm[1]:+.4f} (pozitif: şanssız bir dizi, model kötü günleri fazla çekmiş), üçüncüde "
        f"{_pm[2]:+.4f}. Binlerce deneme sonunda ortalamaların dağılımı çıkar. Bu dağılımın alt %2.5'i ile üst %2.5'i "
        "kesilir, geriye kalan aralık %95 güven aralığıdır. Aralık ne kadar genişse, elimizdeki fark o kadar "
        "belirsizdir. (Bu küçük örnek, bootstrap'i göstermek için seçilmiş örnek girdilerdir.)", P))

    s.append(Paragraph("Güven aralığı neyi söyler, neyi söylemez?", H3))
    s += table([
        ["Doğru okuma", "Yanlış okuma"],
        ["\"Bu veri benzer biçimde tekrar toplansaydı, fark büyük olasılıkla bu aralıkta çıkardı.\"",
         "\"Gerçek farkın bu aralıkta olma olasılığı tam %95'tir.\""],
        ["Aralık sıfırı kapsamıyorsa fark şansla açıklanamayacak kadar tutarlıdır.", "Aralık sıfırı kapsıyorsa model kötüdür. (Hayır: sadece henüz kanıt yoktur.)"],
        ["Aralık dar olsa bile fark küçük olabilir. Anlamlı olmak ile önemli olmak aynı şey değildir.", "Sıfırın altında her fark pratikte değerlidir."],
    ], [8.2, 8.2])
    s.append(Paragraph(
        f"Örneğin WIN Brier farkı {SIG['win_brier']['mean_diff']:+.4f} ve anlamlı, ama bu {abs(SIG['win_brier']['mean_diff']):.3f}'lık küçük bir iyileşmedir. Anlamlı olması, "
        "fark gerçektir demektir, büyük olduğu anlamına gelmez.", P))

    s.append(Paragraph("\"Model daha iyi olasılığı\" nedir?", H3))
    s.append(Paragraph(
        f"Raporlarda aralığın yanında bir yüzde de bulunur (örneğin {pc(SIG['score_total']['p_model_better'])}). Bu, yeniden örneklenen denemelerin "
        "kaçında modelin baseline'dan daha iyi çıktığıdır. Aralık sıfırı hafifçe kapsasa bile bu yüzde yüksek olabilir "
        "(toplam skorda olduğu gibi): yön modelden yana, ama kesin söylemeye yetecek kadar tutarlı değil.", P))

    s.append(Paragraph("Bootstrap'in sınırları", H3))
    s += table([
        ["Sınır", "Açıklama"],
        ["Veri tek bir kez toplandı", "Bootstrap yalnızca eldeki verinin rastgeleliğini ölçer. Sezonlar arasında kalıcı bir "
                                      "değişim (kural, oyun tarzı) olursa bunu göremez."],
        ["Tekrar tekrar bakmak iyimserlik yaratır", "Aynı sezonlara çok kez bakıp karar verildiyse aralık olması gerekenden "
                                                     "dar kalır. Bu yüzden 2026-27 kilitli tutuluyor."],
        ["Gün bloğu bağımsızlık varsayar", "Farklı günler birbirinden bağımsız sayılır. Ardışık günler arasında zayıf bir "
                                          "bağlantı varsa aralık hafif dar çıkabilir."],
        ["Küçük örnek", f"Az gün varsa (en az {MIN_BLOCKS} blok şartı) aralık anlamsızlaşır, bu durumda hesaplanmaz."],
    ], [5, 11.4])

    s.append(Paragraph("AUC için bootstrap", H3))
    s.append(Paragraph(
        "Brier ve MAE'de her maçın bir hata değeri vardır, fark o değerlerin ortalamasıdır. AUC ise tek bir maça "
        "ait bir sayı değil, bütün maçların sıralamasından çıkar. Bu yüzden her bootstrap denemesinde günler yeniden "
        "çekilir ve hem modelin hem Elo'nun AUC'si baştan hesaplanır, aralık bu iki AUC'nin farkından oluşur. "
        f"(Hesap daha ağır olduğu için burada {tr(BOOT_N_AUC)} tekrar kullanılır.)", P))

    s.append(Paragraph("Aralık nasıl okunur?", H3))
    s.append(Paragraph("Tek kural: aralık sıfırı içeriyor mu?", PK))
    s += table([
        ["Aralık", "Anlamı"],
        [f"Tamamen sıfırın altında (örn. {SIG['win_brier']['ci_low']:+.4f} ile {SIG['win_brier']['ci_high']:+.4f})", "Fark gerçek, model daha iyi"],
        [f"Sıfırı içine alıyor (örn. {CUR['brier_vs_elo']['ci_low']:+.4f} ile {CUR['brier_vs_elo']['ci_high']:+.4f})", "Fark şans olabilir, anlamlı değil"],
    ], [8.4, 8])

    s.append(Paragraph("Projedeki iki özel seçim", H3))
    s += table([
        ["Seçim", "Neden"],
        ["Paired (eşli)", "Fark her maç için model ile baseline'ın aynı maçtaki hatası arasında alınır. "
                          "Maçın zorluğu ikisi için aynı olduğundan karşılaştırma çok daha keskin olur."],
        ["Date-block (tarih bloğu)", "Aynı gün oynanan maçlar birlikte örneklenir, çünkü maçlar tamamen bağımsız "
                                     "değildir. Tek tek maç örneklemek aralığı olduğundan dar gösterirdi."],
        ["Ayarlar", f"{tr(BOOT_N)} tekrar, sabit seed ({BOOT_SEED}), en az {MIN_BLOCKS} blok şartı."],
    ], [4.4, 12])

    s.append(Paragraph("Gerçek sonuçlar", H3))
    s.append(Paragraph(
        "Kaynak: walk-forward raporu. Fark = model kaybı eksi baseline kaybı, negatif model lehine.", PK))
    _vt = lambda c: ("Model daha iyi" if c["ci_high"] < 0 else
                     ("<b>Sınırda, anlamlı değil</b>" if c["ci_high"] < 0.005 else "<b>Anlamlı değil</b>"))
    s += table([
        ["Karşılaştırma", "Ortalama fark", "%95 aralık", "Yorum", "Kazanılan sezon"],
        ["WIN Brier / Elo", f"{SIG['win_brier']['mean_diff']:+.4f}", ci_txt(SIG["win_brier"]), _vt(SIG["win_brier"]), f"{WINS_BRIER}/{NF}"],
        ["SCORE margin MAE / son 10", f"{SIG['score_margin']['mean_diff']:+.3f}", ci_txt(SIG["score_margin"], 3), _vt(SIG["score_margin"]), f"{WINS_MARGIN}/{NF}"],
        ["SCORE total MAE / son 10", f"{SIG['score_total']['mean_diff']:+.3f}", ci_txt(SIG["score_total"], 3), _vt(SIG["score_total"]), f"{WINS_TOTAL}/{NF}"],
    ], [4.4, 2.6, 3.6, 3.4, 2.4])
    s.append(Paragraph(
        f"Total MAE en öğretici satırdır. Model nokta tahminde {abs(SIG['score_total']['mean_diff']):.3f} sayı daha iyi, sezon bazında {WINS_TOTAL}/{NF} önde ve "
        f"\"model daha iyi olasılığı\" {pc(SIG['score_total']['p_model_better'])} çıkıyor. Ama aralığın üst ucu {SIG['score_total']['ci_high']:+.3f}, yani sıfırın hemen üstünde: sınırda, "
        f"ve {abs(SIG['score_total']['mean_diff']):.2f} sayı pratikte önemsiz. Bu yüzden \"model daha iyi\" denmiyor. SCORE modeli burada üretim "
        "hattıyla (bağlam düzeltmesi dahil) ölçülüyor.", P))
    s.append(Paragraph(
        "PLAYER için de aynı yöntemle aralık hesaplandı (satır başına mutlak hata farkı, tarih bloklarıyla): "
        + ", ".join(f"{t.upper()} {SIG['player_' + t]['mean_diff']:+.3f} {ci_txt(SIG['player_' + t], 3)}" for t in ("pts", "reb", "ast"))
        + (". Üçü de sıfırın belirgin altında." if all(SIG["player_" + t]["ci_high"] < 0 for t in ("pts", "reb", "ast")) else ". Bazıları sıfırı kapsıyor."), P))

    s.append(Paragraph("Aralık ile sezon tutarlılığı birbirini tamamlar", H3))
    s += table([
        ["", "Neye bakar", "Zayıf yanı"],
        ["Güven aralığı", "Farkın şansa bağlı olup olmadığı", "Tek rakam, sezonlar arası değişimi göstermez"],
        ["Kazanılan sezon (5/5)", "Farkın tekrarlanıp tekrarlanmadığı", "Sayı az, sadece 5 sezon"],
    ], [4.4, 5.8, 6.2])
    s.append(Paragraph(
        "WIN'de ikisi de olumlu, total skorda aralık olumsuz. Bu yüzden WIN için güvenle, total skor için "
        "çekinceyle konuşulur.", P))

    s.append(Paragraph("Total skorda anlamlılığa ulaşmak neden zor?", H3))
    s.append(Paragraph(
        f"Maç başına paired MAE farkının standart sapması yaklaşık {TOTAL_SD:.2f} sayı (güven aralığından türetilmiştir). Tek bir sezonun (~{tr(NG // NF)} maç) "
        f"kayma payı yaklaşık {SEASON_SE:.3f}, yani bir sezonda {2 * SEASON_SE:.2f}'den küçük kazancı gürültüden ayırmak mümkün değil. "
        f"Total skorda canlıdaki kazanç {abs(CUR['total_vs_last10']['mean_diff']):.2f} civarı, bu ölçeğin çok altında.", P))
    s += summary(f"Farkın şans olup olmadığı paired, date-block bootstrap ile test edilir: aynı gün oynanan maçlar birlikte örneklenir, {tr(BOOT_N)} tekrarla %95 aralık çıkarılır. WIN Brier'de aralık sıfırın altında ve {WINS_BRIER}/{NF} sezonda model önde. Toplam skorda nokta tahmin modelden yana olsa da aralık sıfırı kapsar, bu bir kazanç sayılmaz.")
    return s


def ledger():
    s = [PageBreak(), H2N("Kilitli Sezon ve Paper Ledger")]
    s += callout("<b>Kilitli sezon:</b> 2026-27, model eğitimi, ayar ve özellik seçiminde hiç kullanılmaz, yalnızca "
                 "izlenir. <b>Paper ledger:</b> her maçtan önce tahminin dondurulup deftere yazılması. "
                 "Sonradan değiştirilemez.")

    s.append(Paragraph("Neden gerekli?", H3))
    s.append(Paragraph(
        "Walk-forward'da sızıntıyı engelledik, ama kararları (hangi özellik, hangi model) aynı sonuçlara bakarak "
        "verdik. Aynı sınava defalarca girip cevabı görmüş gibiyiz, bu hafif iyimserliğe yol açabilir. Çözüm: "
        "hiç dokunmadığımız, geleceğe ait bir sınav.", P))

    s.append(Paragraph("Defter nasıl çalışıyor?", H3))
    s += table([
        ["Özellik", "Nasıl yapılıyor"],
        ["Ne zaman", f"Maç başlamadan yaklaşık {PRE_TIP} dakika önce"],
        ["Kim yazıyor", "GitHub Actions. Bilgisayar kapalıyken de çalışır, maliyet sıfır"],
        ["Sıklık", f"Maç saatlerinde her {CRON_STEP} dakikada bir"],
        ["Güncel bilgi", "Resmi NBA sakatlık raporu otomatik uygulanır"],
        ["Değişmezlik", "Deftere yazılmış maç bir daha yazılmaz, başlamış maç atlanır"],
        ["Geç kayıt", "Maç başladıktan sonra yazılan kayıt ölçüme girmez"],
    ], [3.6, 12.8])
    s.append(Paragraph(
        "Bu, \"tahmini maçtan sonra yazdım\" ihtimalini ortadan kaldırır. Her kayıt zaman damgası ve model "
        "sürümüyle donmuştur.", P))

    s.append(Paragraph("Sürüm ve kaynak ayrımı", H3))
    s += table([
        ["Etiket", "Neden ayrı tutuluyor"],
        ["Model sürümü (v11, v12, v15)", "Eski sürümün kötü sonucu yenisini kirletmez, yeni sürümün iyi sonucu "
                                         "eskileri gizlemez"],
        ["Kaynak: live", "Gerçek dondurulmuş tahmin"],
        ["Kaynak: backfill", "Sonradan, maç tarihinden önceki verilerle üretildi, sakatlık raporu yok. "
                             "Dondurulmuş çağrı sayılmaz, ölçüme girmez"],
    ], [5.4, 11])

    s.append(Paragraph("Gerçek sonuçlar: v15 canlı, " + str(LEDGER["current_live"]["games"]) + " maç (" + UPDATED + ")", H3))
    s.append(Paragraph("Kaynak: ledger raporu. Fark = model eksi baseline, negatif model lehine.", PK))
    cur = LEDGER["current_live"]
    def ci_text(ci, d):
        return f"[{ci['ci_low']:+.{d}f}, {ci['ci_high']:+.{d}f}]"
    def sig(ci, higher_better=False):
        good = ci["ci_low"] > 0 if higher_better else ci["ci_high"] < 0
        return "Evet" if good else "Hayır"
    b, a_, tt, mm = cur["brier_vs_elo"], cur["auc_vs_elo"], cur["total_vs_last10"], cur["margin_vs_last10"]
    s += table([
        ["Metrik", "Model", "Baseline", "Fark", "%95 aralık", "Anlamlı mı?"],
        ["Brier", f"{cur['brier']:.4f}", f"Elo {cur['elo_brier']:.4f}", f"{b['mean_diff']:+.4f}", ci_text(b, 4), sig(b)],
        ["ROC-AUC", f"{cur['roc_auc']:.4f}", f"Elo {cur['elo_auc']:.4f}", f"{a_['mean_diff']:+.4f}", ci_text(a_, 4), sig(a_, True)],
        ["Toplam MAE", f"{cur['mae_total']:.2f}", f"Son 10: {cur['base_mae_total']:.2f}", f"{tt['mean_diff']:+.2f}", ci_text(tt, 2), sig(tt)],
        ["Margin MAE", f"{cur['mae_margin']:.2f}", f"Son 10: {cur['base_mae_margin']:.2f}", f"{mm['mean_diff']:+.2f}", ci_text(mm, 2), sig(mm)],
    ], [2.8, 1.8, 3.2, 2, 4, 2.6])
    allv = LEDGER["all_valid"]
    s.append(Paragraph(
        f"Defterde toplam {LEDGER['graded']} sonuçlanmış maç var, ama bunların {cur['games']}'i güncel v15 modelinin gerçek "
        f"(maç öncesi dondurulmuş) tahmini. Kalanı eski sürümler (v11, v12) ve sonradan üretilen backfill kayıtları, "
        f"güncel modelin ölçümüne girmez. Karışık {allv['games']} maçta Brier {allv['brier']:.4f} (Elo {allv['elo_brier']:.4f}), "
        f"ROC-AUC {allv['roc_auc']:.4f} (Elo {allv['elo_auc']:.4f}), ama bu karışımın yorumu yoktur.", PK))
    s.append(Paragraph(
        f"Skor tarafında model baseline'a göre hafif önde (toplam {tt['mean_diff']:+.2f}, margin {mm['mean_diff']:+.2f}), ama iki aralık da sıfırı kapsıyor. WIN Brier'de "
        f"model şu an Elo'nun {'hafif gerisinde' if b['mean_diff'] > 0 else 'hafif önünde'} ({b['mean_diff']:+.4f}), bu da anlamlı değil. Örnek büyüdükçe işaret değişebilir; "
        "küçük örnekte işaret kararsızdır. Dürüst cümle: <b>canlıda model Elo'dan ayrışmıyor, ne iyi ne kötü, kanıt yok.</b>", P))
    check(includes0(tt) and includes0(mm), "Canlı skor farkı anlamlı hale geldi: ledger anlatımı gözden geçirilmeli")

    s.append(Paragraph("Defter neyi kanıtlayabilir?", H3))
    _full = FULL_SEASON
    s.append(Paragraph(
        f"Aralığın genişliği maç sayısının karekökü ile küçülür. {cur['games']} maçta yarı genişlik yaklaşık {half_width(cur['games']):.3f}. Kaba "
        "bir ölçekleme (rapordan alınmış bir rakam değil, hesaplanmış tahmin):", PK))
    s += table([
        ["Maç sayısı", "Yaklaşık yarı genişlik (Brier)"],
        [str(cur["games"]), f"±{half_width(cur['games']):.3f}"],
        [str(LEDGER_MIN_GAMES), f"±{half_width(LEDGER_MIN_GAMES):.3f}"],
        [f"~{tr(_full)} (tam sezon)", f"±{half_width(_full):.3f}"],
    ], [6, 10.4])
    _bd = abs(SIG["win_brier"]["mean_diff"])
    check(0.5 < half_width(_full) / _bd < 2, "Tam sezon yarı genişliği backtest farkıyla aynı büyüklükte değil: ledger anlatımı gözden geçirilmeli")
    s.append(Paragraph(
        f"Backtest'te model Elo'yu sadece {_bd:.3f} farkla geçiyordu. Tam sezonda yarı genişlik ({half_width(_full):.3f}) bu farkla aynı büyüklükte, "
        "yani bir sezon bile bu küçük farkı ancak sınırda ayırt edebilir. "
        f"\"~{LEDGER_MIN_GAMES} maçta yeniden bakacağız\" eşiği küçük farkı kanıtlamak için değil, büyük "
        "bir sorunu (model Elo'dan belirgin kötü, kalibrasyon bozuk, canlıda hata) erken yakalamak içindir.", P))

    s.append(Paragraph("Canlı izlemenin bir faydası daha", H3))
    s.append(Paragraph(
        "Canlıda sistem gerçek koşullarda çalışır: sakatlık raporu yayın saatleri, eksik veri, API hataları. "
        "Backtest bunları göremez. Ledger bu yüzden hem \"model iyi mi\" hem \"sistem sağlam mı\" sorusunu "
        "cevaplar. Playoff'taki IS_PLAYOFF hatası da canlı ile offline farkına bakılarak bulundu.", P))
    s += summary(F"Backtest'te aynı katlamalara defalarca bakıldığı için sonuçlar hafif iyimser olabilir. Bu yüzden 2026-27 kilitlendi ve her maçtan önce tahminler GitHub Actions ile dondurulup defterde saklanıyor. {LEDGER['current_live']['games']} canlı maçta model Elo ile ayrışmıyor (Brier {LEDGER['current_live']['brier']:.4f} karşı {LEDGER['current_live']['elo_brier']:.4f}, aralık sıfırı kapsıyor): canlıda kanıt henüz yok. Küçük bir farkı kanıtlamak için bir sezondan fazlası gerekir, defterin asıl işi büyük sorunları erken yakalamaktır.")
    return s


def mae_conformal():
    s = [PageBreak(), H2N("MAE ve Conformal Aralık")]
    s += callout("Şimdiye kadar <b>olasılık</b> tahminlerini (WIN) konuştuk. Skor ve oyuncu modelleri ise "
                 "<b>sayı</b> tahmin eder. Cetvelleri <b>MAE</b>, belirsizlik ölçüleri <b>conformal aralıktır</b>.")

    s.append(Paragraph("MAE: ortalama mutlak hata", H3))
    s.append(Paragraph(
        "Tahminin gerçekten ortalama kaç birim saptığı. Her maç için |gerçek - tahmin| alınır, hepsinin "
        "ortalaması bulunur. Düşük olması iyidir.", P))
    _mt = [(225, 231), (225, 212), (225, 226)]
    s += table([
        ["Maç", "Tahmin", "Gerçek", "Mutlak hata"],
        *[[str(i + 1), str(p), str(a), str(abs(a - p))] for i, (p, a) in enumerate(_mt)],
    ], [3, 4.4, 4.4, 4.6])
    s.append(Paragraph("MAE = (" + " + ".join(str(abs(a - p)) for p, a in _mt) + f") / {len(_mt)} = <b>{sum(abs(a - p) for p, a in _mt) / len(_mt):.1f} sayı</b>. Yön önemli değil, sadece büyüklük. (Örnek girdilerle hesaplanmıştır.)", P))

    s.append(Paragraph("Projedeki gerçek değerler (5 sezon walk-forward)", H3))
    s += table([
        ["Hedef", "Model MAE", "Baseline MAE", "Anlamı"],
        ["Toplam skor", f"{AS['model_total_mae']:.2f}", f"Son 10: {AS['baseline_total_mae']:.2f}", f"Toplamı ortalama ~{AS['model_total_mae']:.0f} sayı yanlış"],
        ["Sayı farkı (margin)", f"{AS['model_margin_mae']:.2f}", f"Son 10: {AS['baseline_margin_mae']:.2f}", f"Farkı ortalama ~{AS['model_margin_mae']:.0f} sayı yanlış"],
        ["Oyuncu sayısı (PTS)", f"{AP['pts']['model_mae']:.2f}", f"EMA-10: {AP['pts']['baseline_mae']:.2f}", f"~{AP['pts']['model_mae']:.1f} sayı"],
        ["Oyuncu ribaundu (REB)", f"{AP['reb']['model_mae']:.2f}", f"EMA-10: {AP['reb']['baseline_mae']:.2f}", f"~{AP['reb']['model_mae']:.1f} ribaund"],
        ["Oyuncu asisti (AST)", f"{AP['ast']['model_mae']:.2f}", f"EMA-10: {AP['ast']['baseline_mae']:.2f}", f"~{AP['ast']['model_mae']:.1f} asist"],
    ], [4.6, 2.6, 3.8, 5.4])
    s.append(Paragraph(
        f"\"{AS['model_total_mae']:.0f} sayı hata çok değil mi?\" Bir maçın toplam sayısı doğası gereği çok gürültülüdür. Baseline da {AS['baseline_total_mae']:.2f} "
        "ile hemen yanındadır, yani hatanın büyük kısmı kaçınılmaz gürültüdür. Önemli olan mutlak büyüklük değil, "
        "baseline'a göre farktır.", P))

    s.append(Paragraph("Neden MAE?", H3))
    s += table([
        ["Sebep", "Açıklama"],
        ["Okunması kolay", "Doğrudan sayı biriminde (sayı, ribaund)"],
        ["Aşırı sonuçlara dayanıklı", "Blowout ve uzatma, karesel metrikler (RMSE) kadar ortalamayı bozmaz"],
        ["Eğitim hedefiyle uyumlu", "Oyuncu modellerinde eğitim hedefi L1 (medyan) kaybıdır. Medyan tahmin etmek "
                                    "MAE'yi küçültür"],
    ], [4.6, 11.8])
    s.append(Paragraph(
        (f"Yan metrik: margin tahmininin işaretine bakarak kazananı seçmek %{SIGN_ACC[0]} doğruluk verir, son-10 baseline "
         f"%{SIGN_ACC[1]} (v13 terfi kaydı, {NGT} maç; kaynak: docs/reports/models/score_model.md). " if SIGN_ACC else "")
        + f"Anlamlılık: margin farkı {SIG['score_margin']['mean_diff']:.2f} sayı, aralık {ci_txt(SIG['score_margin'], 3)}, "
        f"{'gerçek' if SIG['score_margin']['ci_high'] < 0 else 'anlamlı değil'}. Toplam skor farkı {SIG['score_total']['mean_diff']:.3f}, aralık sıfırı {'kapsıyor, anlamlı değil' if includes0(SIG['score_total']) else 'kapsamıyor'}.", P))

    s.append(Paragraph("Conformal aralık", H3))
    s.append(Paragraph(
        "Nokta tahmin (\"toplam 225\") bir şey söyler ama ne kadar güvenebileceğimizi söylemez. Conformal aralık "
        "\"225 ± ne kadar?\" sorusunun dürüst cevabıdır. Modelin geçmiş hatalarına bakar:", PK))
    s += table([
        ["Adım", "Ne yapılır"],
        ["1", "Modelin görmediği veride her maç için |gerçek - tahmin| hesaplanır"],
        ["2", "Bu hataların %80'inin altında kaldığı değer bulunur (80. yüzdelik, küçük bir sonlu örnek "
              "düzeltmesiyle)"],
        ["3", "Yeni tahminin etrafına bu yarıçap konur: tahmin ± yarıçap"],
    ], [2, 14.4])
    s.append(Paragraph(
        "Yani \"geçmişte hataların %80'i bu kadardı, bundan sonra da öyle olması beklenir.\" Veri dağılımı "
        "hakkında bir varsayım (normal dağılım gibi) gerekmez, doğrudan gözlenen hatalara dayanır.", P))

    s.append(Paragraph("Küçük bir örnek: 10 maç", H3))
    _res = [2, 5, 7, 9, 12, 14, 18, 21, 26, 33]
    _k = math.ceil((len(_res) + 1) * 0.80)
    s.append(Paragraph(
        f"Modelin görmediği 10 maçtaki mutlak hatalar küçükten büyüğe: {', '.join(map(str, _res))}. %80 aralık için "
        f"küçük bir sonlu örnek düzeltmesi uygulanır: sıra = yukarı yuvarla((10 + 1) x 0.80) = yukarı yuvarla(8.8) = "
        f"<b>{_k}</b>. {_k}. en küçük hata <b>{_res[_k - 1]}</b>, yani yarıçap ±{_res[_k - 1]}. Yeni bir maçta model 225 "
        f"derse aralık {225 - _res[_k - 1]} ile {225 + _res[_k - 1]}. Düzeltme, az sayıda maçtan öğrenilen yarıçapın "
        f"hafif dar kalmasını önlemek içindir.", P))
    s.append(Paragraph(
        "Bu yöntemin bir koşulu var: yeni maçların hataları, yarıçapı öğrenmek için kullanılan maçların hatalarına "
        "benzer olmalı. Zaman içinde hata yapısı değişirse ya da bir maç türü farklıysa aralık tutmaz. Playoff maçları "
        "tam bu durumdu: playoff sayı farkı hataları daha büyük olduğu için normal sezon yarıçapı bu maçları hedefin "
        "altında kapsıyordu. Bu yüzden playoff maçlarına ayrı bir yarıçap uygulanır (bölüm \"Ölçülüp Kapatılan Fikirler\").", P))

    s.append(Paragraph("Üretim modelinin gerçek yarıçapları", H3))
    _o = lambda lv, t: SM[f"prediction_interval_offsets_{lv}pct"][t][1]
    s += table([
        ["Hedef", "%50 aralık", "%80 aralık", "%90 aralık"],
        ["Toplam skor", *[f"± {_o(lv, 'total'):.1f}" for lv in (50, 80, 90)]],
        ["Sayı farkı", *[f"± {_o(lv, 'margin'):.1f}" for lv in (50, 80, 90)]],
    ], [4.4, 3.8, 3.8, 4.4])
    s.append(Paragraph(
        f"Örnek: model toplam 225 derse %80 aralık yaklaşık {225 - _o(80, 'total'):.0f} ile {225 + _o(80, 'total'):.0f}. Aralıklar geniştir, çünkü maçlar gerçekten "
        "gürültülüdür. Bu genişlik modelin kusuru değil, bilginin dürüstçe ifadesidir.", P))

    s.append(Paragraph("Aralık gerçekten çalışıyor mu?", H3))
    s.append(Paragraph(
        "%80 aralık, görülmemiş maçların yaklaşık %80'ini kapsamalıdır. Bu, kalibrasyonun aralık versiyonudur: "
        "dediğin yüzde, gerçekleşen yüzdeyle örtüşüyor mu? Temiz test için her walk-forward katında yarıçap "
        "yalnızca o katın eğitim sezonlarından öğrenilir ve test sezonuna uygulanır.", PK))
    _cv = lambda f, k: f["score"]["model"][k]
    s += table([
        ["Sezon", "Toplam kapsama", "Margin kapsama"],
        *[[f["test_season"], f"%{_cv(f, 'conformal_80_total_coverage'):.1f}", f"%{_cv(f, 'conformal_80_margin_coverage'):.1f}"] for f in FOLDS],
        ["<b>Ortalama</b>", f"<b>%{AS['average_conformal_80_coverage']:.1f}</b>", f"<b>%{AS['average_conformal_80_margin_coverage']:.1f}</b>"],
    ], [5.4, 5.4, 5.6])
    _allcv = [_cv(f, k) for f in FOLDS for k in ("conformal_80_total_coverage", "conformal_80_margin_coverage")]
    s.append(Paragraph(
        f"Hedef %80, sonuç %{AS['average_conformal_80_coverage']:.1f} ve %{AS['average_conformal_80_margin_coverage']:.1f}: hafif dar, kabul edilebilir. Sezon bazında %{min(_allcv):.0f} ile %{max(_allcv):.0f} arası "
        "dalgalanma doğaldır (margin sütunu, playoff maçlarında playoff'a özel yarıçapı da içerir). Yarıçap her katta yalnızca o katın eğitim sezonlarından "
        "öğrenildiği için bu tablo bağımsız bir testtir.", P))

    s.append(Paragraph("Dürüst sınırlar", H3))
    s += table([
        ["Sınır", "Ne anlama geliyor"],
        ["Genişlik hep aynı", "Her maça aynı yarıçap uygulanır. Dengeli bir maç ile blowout adayı aynı bantla "
                              "gösterilir. Maça göre genişlik ayarlayan yöntemler var, basit olanı seçtik."],
        ["Yalnızca SCORE modelinde", "Oyuncu modellerine conformal aralık eklenmedi."],
        ["Canlı toplam MAE yüksek", f"{CUR['games']} canlı maçta {CUR['mae_total']:.2f}, backtest {AS['model_total_mae']:.2f} ile uyumlu. Baseline {CUR['base_mae_total']:.2f}, yani "
                                    "ayrışma yok."],
    ], [4.8, 11.6])

    s.append(Paragraph("İki aile yan yana", H3))
    s += table([
        ["", "Olasılık tahmini (WIN)", "Sayı tahmini (SCORE, PLAYER)"],
        ["Doğruluk cetveli", "Brier, log loss", "MAE"],
        ["Dürüstlük kontrolü", "Kalibrasyon", "Conformal kapsama"],
        ["Baseline", "Elo", "Son 10 maç, EMA-10"],
        ["Anlamlılık", "Bootstrap aralığı", "Bootstrap (SCORE), sezon tutarlılığı (PLAYER)"],
    ], [4, 5.6, 6.8])
    s += summary(f"Skor ve oyuncu modellerinde ana metrik MAE: toplamda {AS['model_total_mae']:.2f}, margin'de {AS['model_margin_mae']:.2f}, oyuncu sayısında {AP['pts']['model_mae']:.2f}. Baseline margin'de ve oyuncularda anlamlı geçilir, toplam skorda geçilmez. Belirsizlik conformal aralıkla gösterilir: geçmiş hataların %80'inin altında kaldığı yarıçap tahminin etrafına konur. Yarıçap her katta yalnızca eğitim sezonlarından öğrenilip test sezonuna uygulanınca %80 aralık maçların %{AS['average_conformal_80_coverage']:.1f}'ini kapsar, yani aralıklar kalibre.")
    return s


def win_model():
    s = [PageBreak(), H2N("WIN Modeli: Baştan Sona")]
    s += callout(f"<b>Bir cümleyle:</b> Bir maçın ev sahibi galibiyet olasılığını tahmin eden, {len(WIN_FEATURES)} özellikli, kalibre "
                 f"edilmemiş bir Lojistik Regresyon. Tüm özellikler maç öncesi bilgiden üretiliyor. Değerlendirme {NF} "
                 "sezonluk sızıntısız walk-forward ile yapıldı ve saf Elo'ya karşı farkın anlamlı olduğu bootstrap ile "
                 f"gösterildi: Brier {AW['production_brier']:.4f} (saf Elo {AW['elo_brier']:.4f}).")

    s.append(Paragraph("Problem", H3))
    s.append(Paragraph(
        "İkili sınıflandırma, hedef <b>WIN</b>. Çıktı karar değil olasılık. Amaç iyi kalibre bir olasılık, bu yüzden ana "
        "metrik Brier, yardımcı metrik ROC-AUC. Accuracy yalnızca okunabilirlik için. Her maç iki satır (ev ve deplasman "
        "bakış açısı); özelliklerin çoğu \"kendi eksi rakip\" farkı olduğu için taraf seçimi simetrik.", P))

    s.append(Paragraph("Veri", H3))
    s.append(Paragraph(
        f"NBA'in resmi istatistik verisi: takım ve oyuncu kutu skorları, program, sakatlık raporu. Eğitim seti {TRAIN_FIRST} ile {TRAIN_LAST} arasında "
        f"{len(TRAIN_SEASONS)} sezon, <b>{tr(WM['number_of_rows'])} takım-maç satırı</b> (yaklaşık {tr(WM['number_of_rows'] // 2)} maç). <b>{SEASON} kilitli sezon</b>: hiçbir "
        "eğitim, seçim ya da ayar için kullanılmaz, yalnızca ileriye dönük canlı izleme. Her özellik <b>shift(1)</b> ile "
        "yalnızca o maçtan önceki bilgiyi kullanır.", P))

    s.append(Paragraph("11 özellik", H3))
    _fd = [
        ("Güç", "ELO_DIFF", "Sürekli Elo farkı. En güçlü sinyal"),
        ("Güç", "CLEAN_NET_RTG_DIFF_LAST_10", "Son 10 maç net rating farkı, garbage time temizlenmiş"),
        ("Güç", "WINRATE_DIFF_LAST_10", f"Son 10 maç galibiyet oranı farkı (katsayısı {WIN_COEF['WINRATE_DIFF_LAST_10']:+.2f}, aşağıya bak)"),
        ("Bağlam", "IS_HOME, IS_B2B, OPP_IS_B2B, REST_DIFF", "Saha, ardışık maç, dinlenme farkı"),
        ("Kadro", "ABS_DIFF", "Eksik oyuncuların Game Score farkı"),
        ("Kadro", "MISSING_ROT_MINS_DIFF", "Rotasyondan eksik dakika farkı (20+ dakika oynayanlar)"),
        ("Kadro", "ACTIVE_WT_GS_DIFF", "Sahadaki kadronun dakika ağırlıklı Game Score'u"),
        ("Kadro", "ROT_CONTINUITY_DIFF", f"Kadro sürekliliği (permutation katkısı {PERM['ROT_CONTINUITY_DIFF']:.4f}, en düşüklerden)"),
    ]
    check({n.strip() for _, nm, _ in _fd for n in nm.split(",")} == set(WIN_FEATURES), "WIN özellik tablosu win_features.json ile uyuşmuyor")
    s += table([["Grup", "Özellik", "Ne yakalıyor"]] + [[g, n, d] for g, n, d in _fd], [2, 5.8, 8.6])
    s.append(Paragraph(
        f"<b>Elo:</b> K={K_ELO:.0f}, ev sahibi avantajı {HCA:.0f} puan, sezonlar arası regresyon {CARRY}, skor farkı çarpanı. Sabitler "
        "log-loss için grid ile ayarlandı. Bu ayar test sezonlarını da içeren aralıkta yapıldı; aynı Elo hem modelde hem "
        "baseline'da olduğu için kıyas adil, ama mutlak sayılar hafif iyimser.", P))

    s.append(Paragraph("Eğitim süreci", H3))
    s.append(Paragraph(
        "1) Sezon dosyaları birleştirilir, tarihe göre sıralanır. 2) Özellik matrisi üretilir; hedefle çok yüksek korelasyonlu "
        "sütunlar şüpheli sayılır. 3) Zamansal bölme (kronolojik). 4) Üç aile yarışır: Lojistik Regresyon, L1 "
        "Lojistik, LightGBM. 5) <b>Aile seçimi</b> eğitim aralığında genişleyen pencere katlarının ortalama Brier'iyle: LR "
        f"{FAMILY['logistic_regression']:.4f}, L1 {FAMILY['logistic_l1']:.4f}, LightGBM {FAMILY['lightgbm']:.4f}. 6) <b>Kalibrasyon seçimi</b> (kalibrasyonsuz, sigmoid, isotonic) iç holdout'ta: "
        f"{'kalibrasyonsuz' if WM['selected_calibration'] == 'uncalibrated' else WM['selected_calibration']} kazandı. 7) Holdout metrikleri holdout'u hiç görmemiş modelle hesaplanır; gönderilen model sonra "
        "tüm uygun satırlarla yeniden eğitilir.", P))
    s.append(Paragraph(
        "Aile seçiminin hikâyesi: tek bir iç blokta seçim yapınca LightGBM bir katta küçük farkla kazanıp test "
        "sezonunda AUC'de kaybedebiliyordu. Bu yüzden seçimi tek blok yerine birkaç katın ortalamasına taşıdık.", P))

    s.append(Paragraph(f"Değerlendirme: {NF} sezon walk-forward, {NGT} görülmemiş maç", H3))
    s += table([
        ["", "Model", "Saf Elo", "Sabit %50"],
        ["Brier", f"<b>{AW['production_brier']:.4f}</b>", f"{AW['elo_brier']:.4f}", f"{0.5 ** 2:.2f}"],
        ["ROC-AUC", f"<b>{AW['production_auc']:.4f}</b>", f"{AW['elo_auc']:.4f}", "-"],
        ["Accuracy", f"<b>{pc(AW['production_accuracy'], 2)}</b>", pc(AW["elo_accuracy"], 2), "-"],
    ], [3.6, 4, 4, 4.8])
    _fw = min(FOLDS, key=lambda f: f["win"]["production"]["roc_auc"])
    _b0 = CC["pooled"]["bands"][0]
    s.append(Paragraph(
        f"Elo'dan iyi olduğu sezon sayısı: {WINS_BRIER}/{NF}. Fark {SIG['win_brier']['mean_diff']:+.4f}, tarih blok bootstrap ile %95 güven aralığı {ci_txt(SIG['win_brier'])}; "
        f"sıfırı içermiyor. En zayıf sezon {_fw['test_season']} (AUC {_fw['win']['production']['roc_auc']:.3f}, accuracy {pc(_fw['win']['production']['accuracy'], 0)}). "
        f"Kalibrasyon: havuzlanmış ECE {CC['pooled']['ece']:.4f}, bantlarda model dediği ile gerçekleşen birbirine yakın "
        f"(%{_b0['label'][:-1]} bandı hafif aşırı güvenli: {_b0['mean_confidence'] * 100:.1f} dedi, {_b0['accuracy'] * 100:.1f} tuttu).", P))

    s.append(Paragraph("Korumalar ve testler", H3))
    s.append(Paragraph(
        f"Terfi kapıları: Brier ve AUC eşikleri (Brier en fazla {THR['win']['max_brier']}, AUC en az {THR['win']['min_roc_auc']}), champion-challenger (hiçbir metrikte "
        "tolerans üstü kötüleşme yok, en az bir net kazanç), baseline kapısı (Brier Elo'dan düşük, AUC Elo'ya eşit ya da yüksek). Özellik korumaları: sabit "
        f"sütun, çok eksik sütun, {WM['feature_guard']['near_duplicate_threshold']} üzeri korelasyonlu çiftler, lineer bağımlılık, permutation importance. "
        "Train-serve paritesi testi. Dokümandaki rakamlar JSON'dan otomatik üretilir, eski rakam testi kırar.", P))

    s.append(Paragraph("Bilinen sınırlar", H3))
    _g1 = abs(AUD["production"]["brier"] - AUD["elo"]["brier"])
    _g2 = abs(AUD["live_like_serve"]["brier"] - AUD["elo"]["brier"])
    s.append(Paragraph(
        f"<b>1) Availability look-ahead:</b> Eğitim ve backtest {len(WM['feature_contract']['config']['required_features'])} kadro özelliğini maçın kendi kutu skorundan alıyor (kim "
        "gerçekten oynadı); canlıda sakatlık raporu ve önceki maçın kadrosu kullanılıyor. "
        f"Elo'ya göre Brier kazancı {_g1:.4f}, canlıya benzer koşulda {_g2:.4f}. <b>2)</b> Backtest yalnızca ev sahibi satırlarıyla eğitiyor, "
        "trainer iki satırı birden kullanıyor (aynı model, küçük fark). <b>3)</b> Trainer'ın holdout rakamı (Brier "
        f"{WM['holdout_metrics']['brier_score']:.4f}) son ~{tr(HOLDOUT_GAMES)} maçlık dilim; baş sayı walk-forward'dur. <b>4)</b> Tavana yakınız: özellik eklemekle "
        "kazanç küçüldü, yeni bilgi (hakem, yıldız dinlenmesi) gerekir.", P))
    return s


def win_hard_questions():
    s = [PageBreak(), H2N("Sık Sorulan Sorular (WIN)")]

    s.append(Paragraph("Neden Lojistik Regresyon, neden LightGBM değil?", H3))
    s.append(Paragraph(
        f"Veri küçük (~{tr(WM['number_of_rows'] // 2)} maç) ve sinyal zayıf; gürültülü küçük veride esnek modeller gürültüyü ezberler. "
        "ELO_DIFF zaten log-odds ölçeğinde, yani lojistik regresyonun varsayımına uyuyor. Üstelik ölçüldü: eğitim aralığında genişleyen "
        f"pencere katlarının ortalama Brier'i LR {FAMILY['logistic_regression']:.4f}, LightGBM {FAMILY['lightgbm']:.4f}. Seçim kuralı yalnızca eğitim aralığına bakıyor, model "
        "test setinde seçilmedi. Ek avantaj: yorumlanabilir katsayılar, basit train-serve paritesi, ucuz ve kararlı. "
        "<b>Dikkat:</b> bu, \"LightGBM kötüdür\" anlamına gelmez; bu veri ve özellik setiyle kazanç getirmedi. Oyuncu modelinde "
        "LightGBM kullanılıyor.", P))

    s.append(Paragraph("Sızıntı nasıl engelleniyor? shift(1) ne yapıyor?", H3))
    s.append(Paragraph(
        "Sızıntı, tahmin anında bilinemeyecek bilginin modele girmesi. <b>Özellik düzeyi:</b> son 10 maç gibi özellikler "
        "takımın kronolojik maç listesi üzerinde hesaplanıp bir satır kaydırılıyor; t. maçın özelliği yalnızca t-1'e kadar "
        "olan maçlardan geliyor. Kaydırma olmasa son-10 ortalaması tahmin edilen maçın sonucunu da içerirdi. Elo'da "
        "PRE_GAME_ELO maçtan önceki değer, güncelleme maçtan sonra. <b>Bölme düzeyi:</b> rastgele değil kronolojik, "
        "walk-forward; kalibrasyon ve aile seçimi katları da satıra göre değil tarihe göre bölünüyor. <b>Kilitli "
        f"sezon:</b> {SEASON} hiçbir ayar için kullanılmadı. <b>Bilinçli dışarıda bırakılanlar:</b> oyuncu projeksiyon "
        "özellikleri (oyuncu modeli aynı maçların sonuçlarıyla eğitildiği için sızıntı olurdu) ve SCORE modelinin sayı "
        "farkı girdisi.", P))
    s.append(Paragraph(
        "<b>Kalan sızıntılar:</b> availability look-ahead (yukarıda) ve Elo sabitlerinin test sezonlarını da içeren "
        "aralıkta ayarlanması. İkincisi kıyası bozmaz çünkü aynı Elo iki tarafta da var.", P))

    s.append(Paragraph("Katsayısı negatif çıkan özellik nasıl açıklanır?", H3))
    s.append(Paragraph(
        f"WINRATE_DIFF_LAST_10 katsayısı {WIN_COEF['WINRATE_DIFF_LAST_10']:+.2f} (standartlaştırılmış). Katsayı diğer özellikler sabitken <b>kısmi etkiyi</b> gösterir. Elo farkı "
        "uzun vadeli gücü zaten taşıyor ve son 10 maç galibiyet oranıyla güçlü ilişkili. Elo sabitken geriye kalan, "
        "\"Elo'nun beklediğinden fazla mı kazandı\" bilgisi; bu kısmen şans olduğu için ortalamaya dönüş beklenir. "
        f"Özellik işe yarıyor: değerleri karıştırılınca (permutation importance) holdout log loss yaklaşık {PERM['WINRATE_DIFF_LAST_10']:+.4f} artıyor. <b>Dürüst sınır:</b> regresyon "
        "yorumu bir hipotezdir, nedensellik iddiası değildir.", P))

    s.append(Paragraph("Model kalibre mi? Neden ayrı bir kalibrasyon yöntemi eklenmedi?", H3))
    _b0 = CC["pooled"]["bands"][0]
    _bs = {sn: next(b for b in t["bands"] if b["label"] == _b0["label"]) for sn, t in CC["by_season"].items()}
    _ws = min(_bs, key=lambda k: _bs[k]["accuracy"])
    _wb = _bs[_ws]
    s.append(Paragraph(
        f"Evet, çoğunlukla: havuzlanmış ECE {CC['pooled']['ece']:.4f}. Tahmin edilen kazananın olasılığına göre {len(CC['pooled']['bands'])} banda ayırıp \"model dediği "
        "ile gerçekleşen\" kıyaslanıyor: "
        + ", ".join(f"%{b['label'][:-1]} bandı {b['mean_confidence'] * 100:.1f} / {b['accuracy'] * 100:.1f}" for b in CC["pooled"]["bands"])
        + f". Sigmoid ve isotonic zaman sıralı katlarla denendi: kalibrasyonsuz Brier {CAL['logistic_regression_uncalibrated']['brier_score']:.4f}, sigmoid "
        f"{CAL['logistic_regression_sigmoid']['brier_score']:.4f}, isotonic {CAL['logistic_regression_isotonic']['brier_score']:.4f}, yani kazanç yok. Lojistik regresyon log loss'u doğrudan "
        "minimize ettiği için zaten makul kalibre; kalibrasyon ek veri ve ek aşırı uyum riski getirir. <b>Zayıf nokta:</b> düşük güven bandı hafif aşırı güvenli "
        f"({_ws} sezonunda {_wb['mean_confidence'] * 100:.1f} dedi, {_wb['accuracy'] * 100:.1f} tuttu). ECE bant sayısına duyarlıdır, bu yüzden tek başına değil tabloyla birlikte okunmalı.", P))

    s.append(Paragraph("Daha fazla geçmiş sezon eklesen faydalı olur mu?", H3))
    s.append(Paragraph(
        f"Ölçüm sonucu: öğrenme eğrisi neredeyse düz ({LC['test_season']} test sezonunda Brier {LCV[0]['train_seasons']} sezonla {LCV[0]['brier']:.4f}, "
        f"{LCV[-1]['train_seasons']} sezonla {LCV[-1]['brier']:.4f}). Elo'ya karşı kazanç da eğitim verisiyle büyümüyor ({min(LC_GAINS):.4f} ile {max(LC_GAINS):.4f} arası). Az parametreli bir model az sezonda "
        "doyuyor, o yüzden eski sezonlar için API geri doldurmasına değmez. (Kaynak: scripts/win_learning_curve.py, reports/evaluation/win_learning_curve.json.)", P))
    return s


def score_and_player():
    s = [PageBreak(), H2N("SCORE ve Oyuncu Modeli")]
    s += callout("Her model aynı kalıpla anlatılır: <b>ne tahmin ediyor, hangi baseline'a karşı, sonuç ne, sınırı ne.</b> "
                 "WIN ana model; diğer ikisi aynı veri hattının üstüne kurulu.")

    _pr = [AP[t]["mae_reduction"] / AP[t]["baseline_mae"] * 100 for t in ("pts", "reb", "ast")]
    _o80 = lambda t: SM["prediction_interval_offsets_80pct"][t][1]
    s.append(Paragraph("SCORE modeli", H3))
    s += table([
        ["Madde", "Özet"],
        ["Ne tahmin ediyor", "Toplam sayı ve sayı farkı (ev eksi deplasman), ayrıca %80 conformal aralık."],
        ["Mimari", "Toplam = tempo x (ev + deplasman hücum reytingi) / 100 (Ridge'ler). Fark ayrı bir Ridge, girdisi "
                   f"{len(SM['margin_features'])} özellik (güç, bağlam ve kadro özellikleri). Ridge ile zamansal OOF artık düzeltmesi (saha ve gösterge değişkenleri)."],
        ["Baseline", "İki takımın son 10 maç attığı/yediği sayılardan basit tahmin."],
        ["Toplam sayı", f"MAE {AS['model_total_mae']:.2f} vs {AS['baseline_total_mae']:.2f} ({-AS['total_mae_reduction']:+.2f}, {pc(AS['total_mae_reduction'] / AS['baseline_total_mae'])}). "
                        f"{anl(SIG['score_total'])}, CI {ci_txt(SIG['score_total'], 3)} sıfırı {'kapsıyor' if includes0(SIG['score_total']) else 'kapsamıyor'}."],
        ["Sayı farkı", f"MAE {AS['model_margin_mae']:.2f} vs {AS['baseline_margin_mae']:.2f} ({-AS['margin_mae_reduction']:+.2f}, {pc(AS['margin_mae_reduction'] / AS['baseline_margin_mae'], 0)}). "
                       f"{anl(SIG['score_margin'])}, CI {ci_txt(SIG['score_margin'], 3)}." + (f" Kazanan tarafı bulma %{SIGN_ACC[0]} vs %{SIGN_ACC[1]}." if SIGN_ACC else "")],
        ["Sınır", f"Toplamda anlamlı kazanç yok. Aralıklar geniş: %80 aralık toplamda ±{_o80('total'):.0f}, farkta ±{_o80('margin'):.1f} (MAE ~{AS['model_total_mae']:.0f} iken). "
                  f"Kapsama hedefte (toplam %{AS['average_conformal_80_coverage']:.1f}, fark %{AS['average_conformal_80_margin_coverage']:.1f})."],
    ], [3.4, 13])
    s.append(Paragraph(
        "<b>Neden toplam, farktan zor?</b> Toplam, tempo ve hücum verimliliği gürültüsünün birleşimi ve son 10 maç "
        "ortalaması zaten güçlü bir tahminci. Fark ise güç farkı bilgisi (Elo, net rating) içerdiği için model ek değer "
        "katabiliyor.", P))

    s.append(Paragraph("Oyuncu modeli", H3))
    s += table([
        ["Madde", "Özet"],
        ["Ne tahmin ediyor", f"Maçta süre alması beklenen her oyuncunun sayı (PTS), ribaund (REB), asist (AST). Üç ayrı LightGBM, {PM['features_count']} özellik."],
        ["Girdiler", "Form (son 5, EMA-10, dakika başına üretim, dakika trendi, kullanım), bağlam (saha, playoff, dinlenme, "
                     "pozisyon bayrakları, rakibin o pozisyona izin verdiği üretim), takım rotasyon bağlamı."],
        ["Kayıp fonksiyonu", "<b>L1 (medyan)</b>: metrik MAE olduğu için doğrudan onu minimize eder; dağılım çarpık, L2 uç "
                             "değerlerden etkilenirdi."],
        ["Baseline", "Oyuncunun kendi EMA-10 ortalaması."],
        [f"Sonuç ({tr(AP['pts']['total_samples'])} satır)", ", ".join(f"{t.upper()} {AP[t]['model_mae']:.3f} vs {AP[t]['baseline_mae']:.3f} ({pc(AP[t]['mae_reduction'] / AP[t]['baseline_mae'])})" for t in ("pts", "reb", "ast")) + ". "
                                  f"Sezon bazında {', '.join(f'{t.upper()} {WINS_PLAYER[t]}/{NF}' for t in ('pts', 'reb', 'ast'))}; tüm CI'lar sıfırın {'altında' if all(SIG['player_' + t]['ci_high'] < 0 for t in ('pts', 'reb', 'ast')) else 'altında değil'}."],
        ["Sınır", f"Kazanç anlamlı ama küçük (%{min(_pr):.0f}-{max(_pr):.0f}). Hatanın büyük kısmı o gece kaç dakika oynayacağı belirsizliği. "
                  "Nokta (medyan) tahmini veriyor, dağılım vermiyor."],
    ], [3.4, 13])
    s.append(Paragraph(
        "<b>Neden oyuncu tahminleri WIN'e girdi yapılmadı?</b> Oyuncu modeli aynı maçların sonuçlarıyla eğitildi; geçmiş "
        "tahminlerini WIN eğitimine vermek hedef sızıntısı olurdu. Tarih güvenli OOF üretilene kadar kapalı.", P))

    s.append(Paragraph("Üçünü bağlayan hikâye", H3))
    s.append(Paragraph(
        "Ortak veri hattı (aynı Elo ve kadro özellikleri), ortak değerlendirme (aynı walk-forward, aynı bootstrap, her "
        "birinin kendi basit baseline'ı) ve dürüst sonuç tablosu: WIN küçük ama anlamlı, SCORE farkta anlamlı toplamda "
        f"değil, oyuncu hepsinde anlamlı ama %{min(_pr):.0f}-{max(_pr):.0f}. Üçünde de kazanç büyük değil ve rapor bunu açıkça söyler.", P))
    return s


def closed_ideas():
    s = [PageBreak(), H2N("Ölçülüp Kapatılan Fikirler")]
    s += callout("\"Tükendi\" demek yerine <b>neyin nasıl ölçüldüğü ve neden kapatıldığı</b> anlatılır. Rastgele deneme "
                 "yapıp tek bir iyi sonucu sunmaktan daha güvenilirdir.")

    s.append(Paragraph("Sonuçlar", H3))
    s += table([
        ["Fikir", "Sonuç", "Neden"],
        ["Koşullu genişlikli aralıklar", "Kazanç yok",
         "Ölçek modeli (playoff, sezon günü, tahmini toplam/fark, Elo, kadro) hatanın büyüklüğünü öngöremedi: test "
         "sezonlarında korelasyon sıfıra yakındı. Aralıklar biraz daha dar ama aynı oranda daha az kapsıyordu, aralık skoru kötüleşti. "
         "(Deney betikleri saklanmadığı için sayılar bu raporda verilmez.)"],
        ["Playoff'a özel sayı farkı yarıçapı", "<b>Eklendi</b>",
         f"Playoff margin hataları daha büyük. Tek yarıçapla playoff kapsaması %{AS['playoff_margin_coverage_single_radius']:.1f}, ayrı yarıçapla (±{PLAYOFF_R}) %{AS['playoff_margin_coverage']:.1f}. "
         "Toplam ve normal sezon değişmedi."],
        ["Daha fazla geçmiş sezon", "Gereksiz", f"WIN öğrenme eğrisi neredeyse düz (Brier {LCV[0]['brier']:.4f} ile {LCV[-1]['brier']:.4f})."],
        ["Hakem verisi (toplam sayı için)", "Yapılmadı",
         f"Beklenen kazanç küçük ve {NF} sezonluk güven aralığının yarı genişliğinin ({(SIG['score_total']['ci_high'] - SIG['score_total']['ci_low']) / 2:.2f} sayı) altında kalırsa ayırt edilemez. Emek büyük."],
        ["Daha önce denenenler", "Kazanç yok",
         "Oyuncu etki reytingleri, seyahat/saat dilimi/rakım, sezon yenilik ağırlıkları, ilk 5 bayrakları, kutu skoru "
         "fırsat özellikleri."],
        ["Bahis piyasası çizgisi", "Kapsam dışı",
         "En güçlü toplam tahmincisi olurdu ama model bağımsız olmaktan çıkıp piyasa türevi olurdu; bilerek çıkarıldı."],
    ], [4.2, 2.6, 9.6])

    s.append(Paragraph("Playoff yarıçapı hikâyesi", H3))
    _sr = [f["score"]["model"]["conformal_80_playoff_margin_coverage_single_radius"] for f in FOLDS]
    _nolearn = ", ".join(f["test_season"] for f in FOLDS if f["score"]["model"]["conformal_80_playoff_margin_coverage"] == f["score"]["model"]["conformal_80_playoff_margin_coverage_single_radius"])
    s.append(Paragraph(
        "Koşullu aralık deneyi başarısız oldu ama alt kırılımda bir şey çıktı: playoff sayı farkı sistematik az "
        f"kapsanıyordu (tek yarıçapla sezon bazında %{min(_sr):.1f}-{max(_sr):.1f}, {NF} sezonun {sum(1 for v in _sr if v < 80)}/{NF}'i hedefin altında). "
        f"Playoff artıklarından ayrı bir %80 yarıçapı hesaplandı ({PLAYOFF_N} playoff maçı, ±{PLAYOFF_R}). "
        "Eğitim, metadata, API ve ScorePredictor aynı yardımcıyı kullanıyor, walk-forward playoff "
        f"kapsamasını ayrı raporluyor. Sınırlar: hedef %80'in hâlâ altında (%{AS['playoff_margin_coverage']:.1f}), playoff örneği küçük ve sezonlar "
        f"arası gürültülü, {_nolearn} fold'unda yarıçap öğrenilemedi (eğitimde yeterli playoff maçı yok).", P))

    s.append(Paragraph("Bu bölümden çıkan sonuç", H3))
    s += summary("Aralıklar koşullu genişlikle denendi ve hatanın büyüklüğü öngörülebilir çıkmadı. Ama analiz sırasında playoff sayı farkının sistematik olarak az kapsandığı bulundu ve yalnızca orada ayrı bir yarıçap kullanıldı.")

    s.append(Paragraph("Geriye kalan iş: canlı izleme", H3))
    s.append(Paragraph(
        f"Asıl test {SEASON} defteri. Canlı %{CUR['bands'][0]['label'][:-1]} bandı şu an {CUR['bands'][0]['games']} maçta {pc(CUR['bands'][0]['accuracy'])} "
        f"(modelin dediği {pc(CUR['bands'][0]['mean_confidence'])}): örnek küçük, tek bir bandın sapması şans olabilir. Canlıda WIN Brier şu an Elo'dan ayrışmıyor ({CUR['games']} maç), izleme sürüyor. "
        "Modelleme tarafında yeni bilgi kaynağı olmadan anlamlı iş kalmadı.", P))
    return s


def roc_auc():
    s = [PageBreak(), H2N("ROC-AUC")]
    s += callout("<b>Tek cümle:</b> Rastgele seçilen bir kazanılan maç ile bir kaybedilen maç alındığında, modelin "
                 "kazanılana daha yüksek olasılık vermesi ihtimali. 0.5 şans, 1.0 mükemmel.")

    s.append(Paragraph("Nasıl okunur?", H3))
    s.append(Paragraph(
        "Model her maça bir olasılık verir. Maçları bu olasılığa göre sıralarsak, iyi bir model gerçekten kazanılan "
        "maçları listenin üstüne koyar. AUC, bu sıralamanın kalitesidir. Eşik (%50, %60) seçmek gerekmez, çünkü "
        "bütün eşikleri birden değerlendirir. Bu yüzden accuracy'nin tersine, eşiğe duyarlı değildir.", P))
    s += table([
        ["AUC", "Anlamı"],
        ["0.50", "Sıralama rastgele, hiçbir şey ayırt edilmiyor"],
        ["0.70", "Yaklaşık her 10 çiftten 7'sinde kazanan daha yüksek puan alıyor"],
        ["1.00", "Mükemmel ayrım (NBA'de gerçekçi değil, tek maç çok gürültülü)"],
    ], [3, 13.4])

    s.append(Paragraph("Küçük bir hesap: 6 maç", H3))
    s.append(Paragraph(
        "Modelin 6 maça verdiği olasılıklar ve sonuçlar:", PK))
    _p = [0.80, 0.70, 0.60, 0.55, 0.40, 0.30]
    _y = [1, 1, 0, 1, 0, 0]
    s += table([
        ["Maç", "Verilen olasılık", "Sonuç"],
        *[[str(i + 1), f"{p:.2f}", "kazandı" if y else "kaybetti"] for i, (p, y) in enumerate(zip(_p, _y))],
    ], [3, 6, 7.4])
    _win = [p for p, y in zip(_p, _y) if y]
    _lose = [p for p, y in zip(_p, _y) if not y]
    _counts = [sum(w > l for l in _lose) for w in _win]
    s.append(Paragraph(
        f"3 kazanılan ve 3 kaybedilen maç var, yani 3 x 3 = 9 çift. Her çiftte kazanılan maça daha yüksek olasılık "
        f"verilmiş mi diye bakılır. Olasılığı {_win[0]:.2f} olan maç 3 kaybedilen maçın {_counts[0]}'ünün, {_win[1]:.2f} "
        f"olan {_counts[1]}'ünün, {_win[2]:.2f} olan ise {_counts[2]}'sinin önünde. Toplam {sum(_counts)} çiftte doğru "
        f"sıralama var: AUC = {sum(_counts)} / 9 = <b>{sum(_counts) / 9:.3f}</b>. Tek hata, 0.55 verilen kazanılmış maçın 0.60 "
        f"verilen kaybedilmiş maçın gerisinde kalması.", P))

    s.append(Paragraph("ROC eğrisi nereden geliyor?", H3))
    s.append(Paragraph(
        "\"ROC\" adı, bir eşiği (%50, %55, %60, ...) kaydırırken iki oranın birlikte nasıl değiştiğini çizen eğriden gelir: "
        "kazanılan maçların kaçının doğru yakalandığı (doğru pozitif oranı) ve kaybedilen maçların kaçının yanlışlıkla "
        "kazanılacak sanıldığı (yanlış pozitif oranı). Eşik çok yüksekse ikisi de düşüktür, çok düşükse ikisi de yüksektir. "
        "İyi bir modelde eğri sol üst köşeye yaklaşır; hiçbir şey bilmeyen modelde köşegen çizgidir. AUC bu eğrinin altında "
        "kalan alandır ve yukarıdaki çift sayımıyla birebir aynı değeri verir.", P))

    s.append(Paragraph("Brier ile farkı", H3))
    s.append(Paragraph(
        "AUC yalnızca sıralamaya bakar, olasılıkların dürüstlüğüne bakmaz. Bütün olasılıkları aynı oranda "
        "şişirirsek (%60 yerine %90 desek) sıralama değişmez, AUC aynı kalır, ama Brier bozulur. Tersine Brier "
        "hem ayrımı hem kalibrasyonu ölçer. Bu yüzden ikisi birbirini tamamlar: AUC \"ayırt edebiliyor mu\", "
        "Brier \"söylediği yüzde doğru mu\" sorusunu cevaplar.", P))

    s.append(Paragraph("Projede takip ediliyor mu? Evet", H3))
    s.append(Paragraph(
        "Ana metrik Brier, yardımcı metrik ROC-AUC. Her walk-forward katında ve terfi kapılarında ölçülüyor: "
        f"<b>min_roc_auc {THR['win']['min_roc_auc']:.2f}</b> eşiği var ve baseline kapısı AUC'nin Elo'ya eşit ya da yüksek olmasını istiyor.", P))
    folds = FOLDS
    rows = [["Test sezonu", "Bizim model", "Saf Elo", "Fark"]]
    for f in folds:
        m, e = f["win"]["production"]["roc_auc"], f["win"]["pregame_elo"]["roc_auc"]
        rows.append([f["test_season"], f"{m:.3f}", f"{e:.3f}", f"{m - e:+.3f}"])
    rows.append([f"{NF} sezon (havuz)", f"<b>{AW['production_auc']:.4f}</b>", f"{AW['elo_auc']:.4f}", f"{AW['production_auc'] - AW['elo_auc']:+.3f}"])
    s += table(rows, [4, 4, 4, 4.4])
    _fd = [(f["win"]["production"]["roc_auc"] - f["win"]["pregame_elo"]["roc_auc"], f["test_season"], f["win"]["production"]["roc_auc"], f["win"]["production"]["brier"]) for f in folds]
    _hi, _lo = max(_fd, key=lambda t: t[2]), min(_fd, key=lambda t: t[2])
    _same = _hi[1] == min(_fd, key=lambda t: t[3])[1] and _lo[1] == max(_fd, key=lambda t: t[3])[1]
    s.append(Paragraph(
        f"Okunuşu: model {'her sezonda' if all(d > 0 for d, _, _, _ in _fd) else 'bazı sezonlarda'} Elo'nun üstünde, fark {min(d for d, _, _, _ in _fd):.3f} ile {max(d for d, _, _, _ in _fd):.3f} arasında. "
        f"En zayıf sezon {_lo[1]} ({_lo[2]:.3f}), en güçlüsü {_hi[1]} ({_hi[2]:.3f}). "
        + ("Aynı sezon sıralaması Brier'de de görülüyor, yani iki metrik aynı hikâyeyi anlatıyor. " if _same else "")
        + f"Accuracy ise {pc(AW['production_accuracy'], 2)} ile {pc(AW['elo_accuracy'], 2)}, fark çok daha az belirgin.", P))
    wa = SIG["win_auc"]
    s.append(Paragraph(
        f"AUC farkı için de aynı blok bootstrap uygulandı (yöntem \"Bootstrap Güven Aralığı\" bölümünde anlatılır; "
        f"tarihler blok olarak yeniden örneklenir ve her denemede iki AUC yeniden hesaplanır): havuzlanmış fark <b>{wa['mean_diff']:+.4f}</b>, %95 aralık "
        f"[{wa['ci_low']:+.4f}, {wa['ci_high']:+.4f}], sıfırın üstünde. Yani backtestte AUC farkı Brier farkı kadar "
        f"anlamlı. (Tablodaki {AW['production_auc']:.4f} sezon AUC'lerinin maç sayısıyla ağırlıklı ortalaması, havuzlanmış AUC'de "
        f"fark biraz farklı hesaplanır.)", P))

    cur = LEDGER["current_live"]
    la = cur["auc_vs_elo"]
    s.append(Paragraph(f"Bu sezon canlıda (2026-27, {UPDATED})", H3))
    s += table([
        ["", "Model (v15)", "Saf Elo", "Fark", "%95 aralık"],
        [f"Canlı, {cur['games']} maç", f"{cur['roc_auc']:.4f}", f"{cur['elo_auc']:.4f}", f"{la['mean_diff']:+.4f}",
         f"[{la['ci_low']:+.4f}, {la['ci_high']:+.4f}]"],
        [f"Backtest, {NGT} maç", f"{AW['production_auc']:.4f}", f"{AW['elo_auc']:.4f}", f"{wa['mean_diff']:+.4f}", f"[{wa['ci_low']:+.4f}, {wa['ci_high']:+.4f}]"],
    ], [4.4, 3, 3, 2.6, 3.4])
    s.append(Paragraph(
        f"Okunuşu: {cur['games']} canlı maçta model AUC'si {cur['roc_auc']:.3f}, Elo'nun {cur['elo_auc']:.3f}'ü. "
        f"Fark küçük ve {'negatif' if la['mean_diff'] < 0 else 'pozitif'} ({la['mean_diff']:+.4f}), aralık ±{(la['ci_high'] - la['ci_low']) / 2:.2f} civarı geniş ve sıfırı kapsıyor, yani canlıda "
        f"model ile Elo AUC'de de ayrışmıyor, Brier'deki tablonun aynısı. Canlı AUC'nin backtestten ({AW['production_auc']:.2f}) yüksek "
        f"çıkması modelin daha iyi olduğu anlamına gelmez, yalnızca bu {cur['games']} maçın daha kolay ayrıştığını gösterir, "
        f"Elo da aynı yükselişi ({AW['elo_auc']:.2f} değerinden {cur['elo_auc']:.2f} değerine) gösteriyor. Kıyaslanacak şey iki sayının farkı.", P))

    s.append(Paragraph("Neden ana metrik Brier, AUC değil?", H3))
    s += table([
        ["Konu", "Brier", "ROC-AUC"],
        ["Neye bakar", "Olasılığın değeri", "Yalnızca sıralama"],
        ["Kalibrasyonu görür mü", "Evet", "Hayır"],
        ["Bahis/olasılık kullanımı için", "Doğrudan ilgili", "Dolaylı"],
        ["Küçük iyileşmeyi yakalama", "Duyarlı", "Daha az duyarlı"],
    ], [5.4, 5.4, 5.6])
    s.append(Paragraph(
        "Proje olasılık gösteriyor (\"bu takım %68 kazanır\"), o yüzden o yüzdelerin doğru olması "
        "önemli. AUC yardımcı kontrol olarak tutulur: Brier düşerken AUC yükselmiyorsa kazanç ayrımdan "
        "değil kalibrasyon ayarından geliyordur, bu da şüphe uyandırır.", P))

    s.append(Paragraph("Sık sorulan sorular", H3))
    s += table([
        ["Soru", "Kısa cevap"],
        ["Accuracy yerine neden AUC?", "Çıktı olasılık. Accuracy eşiğe bağlı ve %51 ile %99'u aynı sayar. AUC "
                                       "eşik seçmeden ayrım gücünü ölçer."],
        ["AUC tek başına yeter mi?", "Hayır. Kalibrasyonu görmez. Olasılıklar bozuk olsa da AUC aynı çıkar, "
                                     "bu yüzden Brier ve kalibrasyon tablosu da var."],
        [f"{AW['production_auc']:.2f} iyi mi?", f"NBA tek maçında gürültü yüksek. Saf Elo {AW['elo_auc']:.2f}, model {AW['production_auc']:.2f}. Çok daha yüksek değerler beklenmez, "
                         "görülürse önce sızıntıdan şüphelenilir."],
        ["AUC mi Brier mi terfi karar verir?", "İkisi de kapı. Brier Elo'dan düşük, AUC Elo'ya eşit ya da yüksek "
                                              "olmalı, ayrıca champion'a göre hiçbir metrikte tolerans üstü kötüleşme olmamalı."],
    ], [5, 11.4])
    s += summary(f"Çıktı olasılık olduğu için accuracy yanıltıcıdır. Ana metrik Brier, yardımcı metrik ROC-AUC: Brier olasılığın gerçeğe uzaklığını, AUC ise eşik koymadan doğruyu yanlıştan ayırabilmeyi ölçer. {NF} sezonda AUC {AW['production_auc']:.4f}, saf Elo {AW['elo_auc']:.4f} ve fark anlamlı. Bu sezon canlıda ise model ile Elo ayrışmıyor.")
    return s


def glossary():
    s = [PageBreak(), H2N("Sözlük")]
    s.append(Paragraph("Rapordaki terimler tek yerde, alfabetik sırayla.", PK))
    terms = [
        ("Accuracy (doğruluk)", "Favori diye seçilen tarafın kazandığı maçların oranı. Olasılığın kalitesini ölçmez."),
        ("AUC (ROC-AUC)", "Kazanılan ve kaybedilen maçlardan oluşan çiftlerin kaçında kazanılana daha yüksek olasılık "
                         "verildiği. 0.5 şans, 1.0 mükemmel."),
        ("Baseline", "Akıllı bir model kurmadan, basit bir yöntemle elde edilen sonuç. Modelin değeri bununla farkıdır."),
        ("Blok (date-block)", "Bootstrap'te aynı gün oynanan maçların birlikte örneklenmesi."),
        ("Bootstrap", "Eldeki veriden yerine koyarak tekrar tekrar yeni örnek çekip bir sayının ne kadar oynadığını ölçme."),
        ("Brier skoru", "Olasılık ile gerçek sonuç (1 ya da 0) arasındaki farkın karesinin ortalaması. Düşük iyidir."),
        ("Champion-challenger", "Yeni modelin (challenger) üretimdeki modele (champion) göre kötüleşmediğini ve bir yerde "
                                "kazandığını kontrol eden terfi kapısı."),
        ("Conformal aralık", "Geçmiş hataların belirli bir yüzdesini kapsayan yarıçapı tahminin etrafına koyarak elde edilen "
                             "belirsizlik aralığı."),
        ("ECE", "Kalibrasyon hatasının tek sayıya özeti: olasılık bantlarındaki sapmanın maç sayısıyla ağırlıklı ortalaması."),
        ("Elo", "Her takıma tek bir güç puanı veren, her maçtan sonra güncelleyen reyting sistemi."),
        ("EMA-10", "Son maçlara daha çok ağırlık veren hareketli ortalama. Oyuncu baseline'ı."),
        ("Expanding window", "Eğitim penceresinin her adımda büyüdüğü zaman sıralı doğrulama."),
        ("Kalibrasyon", "Modelin verdiği olasılıkların gerçekleşen oranlarla örtüşmesi."),
        ("Kilitli sezon", f"{SEASON}: eğitim, ayar ya da seçim için hiç kullanılmayan, yalnızca izlenen sezon."),
        ("Log loss", "Gerçekleşen sonuca verilen olasılığın -ln'inin ortalaması. Kendinden emin yanlışları çok sert cezalandırır."),
        ("MAE", "Ortalama mutlak hata: tahminin ortalama kaç birim saptığı."),
        ("OOF (out-of-fold)", "Her satır için tahminin, o satırı görmeyen bir modelden alınması."),
        ("Paired (eşli) fark", "Model ile baseline'ın aynı maçtaki hatalarının farkı. Maç zorluğu ikisi için ortak olduğundan kıyas keskinleşir."),
        ("Paper ledger", "Tahminin maçtan önce dondurulup değiştirilemez biçimde yazıldığı defter."),
        ("Sızıntı (leakage)", "Modelin, gerçek hayatta o anda bilemeyeceği bir bilgiyi görmesi."),
        ("shift(1)", "Bir özelliğin yalnızca önceki maçlardan hesaplanması için değerlerin bir satır kaydırılması."),
        ("Train-serve skew", "Bir özelliğin eğitimde ve canlıda farklı hesaplanması."),
        ("Walk-forward", "Zamanı gerçek sırasıyla oynayıp her seferinde yalnızca geçmişle eğitip sonraki dönemi test etme."),
    ]
    s += table([["Terim", "Anlamı"]] + [[f"<b>{a}</b>", b] for a, b in terms], [4.6, 11.8])
    return s


def sources():
    s = [H2N("Rakamlar Nereden Geliyor ve Nasıl Güncellenir?")]
    s += table([
        ["İçerik", "Kaynak"],
        ["Backtest, AUC aralığı, kalibrasyon bantları, kadro denetimi", "reports/evaluation/multi_season_walk_forward_backtest.json"],
        ["Canlı sonuçlar ve ledger örnekleri", "reports/evaluation/paper_ledger_2026_27.json ve data/predictions defteri"],
        ["Model ayrıntıları, yarıçaplar, katsayılar, aile seçimi", "models/production/*_metadata.json, win_model.pkl, win_features.json"],
        ["Öğrenme eğrisi", "reports/evaluation/win_learning_curve.json (scripts/win_learning_curve.py)"],
        ["Elo sabitleri, açılış puanları ve örnek maç hesabı", "src/features/continuous_elo.py ve sezonun açılış puanları"],
        ["Defter sıklığı ve pencere", ".github/workflows/snapshot.yml"],
        ["Terfi eşikleri", "config/training_manifest.yaml"],
    ], [7, 9.4])
    s.append(Paragraph(
        "Canlı rakamlar defter büyüdükçe değişir. Raporu güncellemek için önce defter raporu yenilenir, sonra PDF yeniden "
        "üretilir:", PK))
    s.append(Paragraph("<font name=\"Body-Italic\">PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27</font>", P))
    s.append(Paragraph("<font name=\"Body-Italic\">python3 docs/project_report/build_project_report.py rapor.pdf</font>", P))
    s.append(Paragraph(
        "Başlıktaki güncelleme tarihi, defter raporunun üretim zamanından otomatik alınır. Bu raporda rakam, tablo ya da örnek hesap "
        "elle yazılmaz: hepsi yukarıdaki dosyalardan ve kaynak koddaki sabitlerden okunur ya da hesaplanır. Yalnızca anlatım metni elle "
        "yazılmıştır; küçük açıklayıcı örnekler (3 maçlık Brier, 8 günlük bootstrap, 6 maçlık AUC, 10 maçlık conformal) örnek girdilerden "
        "hesaplanır ve örnek olarak etiketlenir. Anlatımın dayandığı varsayımlar (örneğin \"canlıda fark anlamlı değil\") veri "
        "değişince bozulursa, PDF üretilirken uyarı basılır.", P))
    return s


SECTIONS = [overview, calibration, brier, logloss, roc_auc, connection, baseline, elo, walk_forward, bootstrap, ledger,
            mae_conformal, win_model, win_hard_questions, score_and_player, closed_ideas, glossary, sources]


def glue(story):
    """Baslik ve giris cumlelerini ardindaki ilk blokla (tablo/paragraf) tek blokta tutar."""
    out, pending = [], []
    for f in story:
        if isinstance(f, Paragraph) and f.style.name in ("H3", "PK"):
            pending.append(f)
        elif pending:
            out.append(KeepTogether(pending + [f]))
            pending = []
        elif isinstance(f, Table):
            out.append(KeepTogether([f]))
        else:
            out.append(f)
    return out + pending


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("proje_raporu.pdf")
    doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=2.3 * cm, rightMargin=2.3 * cm,
                            topMargin=1.9 * cm, bottomMargin=1.9 * cm,
                            title="NBA Maç Tahmin Modeli - Proje Raporu", author="NBA Model App")
    story = [Paragraph("NBA Maç Tahmin Modeli: Proje Raporu", H1),
             Paragraph("Modellerin kurulumu, değerlendirme yöntemleri ve sonuçlar; kavramlar sade anlatımla.", SUB),
             Paragraph(f"<b>Son güncelleme: {UPDATED}</b> (UTC {LEDGER['generated_utc'][11:16]}). Canlı rakamlar "
                       f"paper ledger raporundan: {LEDGER['graded']} sonuçlanmış maç, son maç {LEDGER['last_game_date']}, "
                       f"güncel v15 modeli için {LEDGER['current_live']['games']} canlı maç. Backtest rakamları "
                       f"5 sezonluk walk-forward raporundan.", PK)]
    for build in SECTIONS:
        story += build()
    story = glue(story)
    while story and isinstance(story[-1], Spacer):
        story.pop()
    trimmed = []
    for f in story:
        if isinstance(f, PageBreak):
            while trimmed and isinstance(trimmed[-1], Spacer):
                trimmed.pop()
        trimmed.append(f)
    story = trimmed

    def footer(canvas, d):
        canvas.setFont("Body", 8.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(2.3 * cm, 1.2 * cm, "NBA Model App - Proje Raporu")
        canvas.drawRightString(A4[0] - 2.3 * cm, 1.2 * cm, str(d.page))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(out)
    for w in WARN:
        print("UYARI:", w)


if __name__ == "__main__":
    main()
