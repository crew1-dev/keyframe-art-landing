#!/usr/bin/env python3
"""Build assets/reel/NN.jpg — 45+ frames of iconic stories through history.

Draws from public-domain works on Wikimedia Commons: classic paintings that
depict famous stories, book illustrations, and pre-1928 cinema stills.
Each frame is cropped to a consistent 5:7 portrait, warmly sepia-toned, and
saved at a web-friendly size.

Run from the project root:
    /tmp/kfvenv/bin/python3 tools/build_reel.py

Downloads are cached in assets/.cache-reel/ so re-runs are fast.
A manifest.json is written alongside the frames.
"""

from __future__ import annotations

import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import (
    Image,
    ImageChops,
    ImageDraw,
    ImageEnhance,
    ImageFilter,
    ImageOps,
)


ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "reel"
CACHE_DIR = ROOT / "assets" / ".cache-reel"

FRAME_W, FRAME_H = 460, 644  # 5:7 portrait
JPEG_Q = 82

# Wikimedia requires a descriptive UA with contact info for automated access.
UA = ("KeyframeLandingAssetBuilder/1.0 "
      "(one-off local build; https://keyframe.local; contact: dev@localhost) "
      "Pillow/12 Python/3.14")

FP = "https://commons.wikimedia.org/wiki/Special:FilePath/{name}?width=1000"

# (filename on Commons, short label, recommended vertical focus 0.0 = top .. 1.0 = bottom)
# Focus is the portion of the source image to keep when cropping to portrait.
# A handful will 404 or redirect awkwardly — the builder skips those gracefully.
CANDIDATES: list[tuple[str, str, float]] = [
    # ── Paintings: stories in oil ─────────────────────────────────────────
    ("The_Great_Wave_off_Kanagawa.jpg",                                                   "Hokusai — Great Wave",             0.50),
    ("John_Everett_Millais_-_Ophelia_-_Google_Art_Project.jpg",                           "Millais — Ophelia",                0.50),
    ("John_William_Waterhouse_-_The_Lady_of_Shalott_-_Google_Art_Project_edit.jpg",       "Waterhouse — Lady of Shalott",     0.50),
    ("Eug%C3%A8ne_Delacroix_-_Le_28_Juillet._La_Libert%C3%A9_guidant_le_peuple.jpg",      "Delacroix — Liberty",              0.40),
    ("Jacques-Louis_David_-_The_Death_of_Socrates_-_Google_Art_Project.jpg",              "David — Death of Socrates",        0.45),
    ("JEAN_LOUIS_TH%C3%89ODORE_G%C3%89RICAULT_-_La_Balsa_de_la_Medusa_(Museo_del_Louvre,_1818-19).jpg",
                                                                                          "Géricault — Raft of the Medusa",   0.55),
    ("Caravaggio_-_Giuditta_che_taglia_la_testa_a_Oloferne.jpg",                          "Caravaggio — Judith",              0.50),
    ("Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",        "Botticelli — Birth of Venus",      0.50),
    ("Botticelli-primavera.jpg",                                                          "Botticelli — Primavera",           0.50),
    ("The_Scream.jpg",                                                                    "Munch — The Scream",               0.45),
    ("Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",                                  "Van Gogh — Starry Night",          0.50),
    ("Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpeg",                       "Friedrich — Wanderer",             0.45),
    ("Michelangelo_-_Creation_of_Adam_(cropped).jpg",                                     "Michelangelo — Creation of Adam",  0.50),
    ("Turner,_J._M._W._-_The_Fighting_T%C3%A9m%C3%A9raire_tugged_to_her_last_Berth_to_be_broken.jpg",
                                                                                          "Turner — Fighting Téméraire",      0.55),
    ("The_Slave_Ship_-_J.M.W._Turner.jpg",                                                "Turner — The Slave Ship",          0.55),
    ("The_Night_Watch_-_HD.jpg",                                                          "Rembrandt — Night Watch",          0.50),
    ("Vermeer,_Johannes_-_Girl_with_a_Pearl_Earring_-_Royal_Picture_Gallery_Mauritshuis_-_670.jpg",
                                                                                          "Vermeer — Girl with a Pearl Earring", 0.40),
    ("Jheronimus_Bosch_-_Triptych_of_Garden_of_Earthly_Delights_(central_panel)_-_WGA2505.jpg",
                                                                                          "Bosch — Garden of Earthly Delights",  0.45),
    ("Van_Eyck_-_Arnolfini_Portrait.jpg",                                                 "Van Eyck — Arnolfini",             0.40),
    ("Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg",              "Velázquez — Las Meninas",          0.45),
    ("%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg",                      "Raphael — School of Athens",       0.45),
    ("Pieter_Bruegel_de_Oude_-_De_val_van_Icarus.jpg",                                    "Bruegel — Fall of Icarus",         0.50),
    ("Francisco_de_Goya,_Saturno_devorando_a_su_hijo_(1819-1823).jpg",                    "Goya — Saturn",                    0.50),
    ("Gustav_Klimt_016.jpg",                                                              "Klimt — The Kiss",                 0.50),
    ("Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg",                         "Da Vinci — Mona Lisa",             0.40),
    ("The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg",                   "Da Vinci — Last Supper",           0.50),
    ("Edouard_Manet_-_Le_Dejeuner_sur_l%27herbe.jpg",                                     "Manet — Déjeuner sur l'herbe",     0.50),
    ("A_Bar_at_the_Folies-Berg%C3%A8re_by_Edouard_Manet.jpg",                             "Manet — Folies-Bergère",           0.45),
    ("Claude_Monet,_Impression,_soleil_levant.jpg",                                       "Monet — Impression, Sunrise",      0.50),
    ("Edgar_Degas_-_The_Ballet_Class_-_Google_Art_Project.jpg",                           "Degas — The Ballet Class",         0.50),
    ("Jean-Honor%C3%A9_Fragonard_-_The_Swing.jpg",                                        "Fragonard — The Swing",            0.45),
    ("Hokusai-fuji7.png",                                                                 "Hokusai — Red Fuji",               0.50),
    ("Leonardo_da_Vinci_-_presumed_self-portrait_-_WGA12798.jpg",                         "Da Vinci — self portrait",         0.45),
    ("Johannes_Vermeer_-_The_Milkmaid_-_Google_Art_Project.jpg",                          "Vermeer — The Milkmaid",           0.50),
    ("Dante_and_Virgil_in_Hell_(William-Adolphe_Bouguereau).jpg",                         "Bouguereau — Dante and Virgil",    0.50),

    # ── Book illustrations ────────────────────────────────────────────────
    ("Dore_-_Inferno_-_Plate_10_(Canto_III_-_Charon).jpg",                                "Doré — Dante's Inferno",           0.50),
    ("Don_Quijote_y_Sancho_Panza,_por_Gustave_Dor%C3%A9_(detalle).jpg",                   "Doré — Don Quixote",               0.50),
    ("Dore_wood_demon.jpg",                                                               "Doré — Paradise Lost",             0.50),
    ("Alice_par_John_Tenniel_09.png",                                                     "Tenniel — Alice in Wonderland",    0.50),
    ("Rackham_Little_Red_Riding_Hood_1909.jpg",                                           "Rackham — Red Riding Hood",        0.50),

    # ── Early cinema (pre-1928, public domain) ────────────────────────────
    ("Le_Voyage_dans_la_lune.jpg",                                                        "Méliès — Trip to the Moon (1902)", 0.45),
    ("Nosferatu_(1922)_-_Max_Schreck_as_Orlok.png",                                       "Nosferatu (1922)",                 0.40),
    ("Caligariposter.jpg",                                                                "Caligari (1920) poster",           0.50),
    ("Metropolis_poster.jpg",                                                             "Metropolis (1927) poster",         0.50),
    ("Battleship_Potemkin_poster.jpg",                                                    "Battleship Potemkin (1925)",       0.50),
    ("Buster_Keaton_in_The_General_(1926)_2.jpg",                                         "Keaton — The General (1926)",      0.45),
    ("The_Kid_(1921_film)_poster.jpg",                                                    "Chaplin — The Kid (1921) poster",  0.50),
    ("The_Gold_Rush_-_Chaplin.jpg",                                                       "Chaplin — Gold Rush (1925)",       0.45),
    ("Safety_Last!_(1923)_-_Clock.jpg",                                                   "Lloyd — Safety Last! (1923)",      0.45),
    ("The_Phantom_of_the_Opera_(1925_film)_Chaney.jpg",                                   "Phantom of the Opera (1925)",      0.45),
    ("Cabiria-Maciste.jpg",                                                               "Cabiria (1914)",                   0.50),

    # ── Classical sculpture/relief that embodies a story ──────────────────
    ("Laocoon_and_his_sons_group.jpg",                                                    "Laocoön and His Sons",             0.40),
    ("Venere_di_Milo_02.JPG",                                                             "Venus de Milo",                    0.40),
    ("Discobolus_Lancellotti_Massimo.jpg",                                                "Discobolus",                       0.40),

    # ── Additional paintings to round the reel out ────────────────────────
    ("Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna).jpg",                        "Bruegel — Tower of Babel",         0.50),
    ("Paul_Gauguin_-_D%27ou_venons-nous.jpg",                                             "Gauguin — Where Do We Come From",  0.50),
    ("Hokusai_-_Red_Fuji_southern_wind_clear_morning.jpg",                                "Hokusai — South Wind Clear Morning", 0.50),
    ("Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg",                                   "Monet — Water Lilies",             0.50),
    ("Passion_joan_of_arc.jpg",                                                           "Passion of Joan of Arc (1928)",    0.40),
    ("Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg",                       "Rembrandt — Self Portrait",        0.40),
    ("Parmigianino_self_portrait.jpg",                                                    "Parmigianino — Self Portrait",     0.40),
    ("Henri_Rousseau_-_The_Sleeping_Gypsy.jpg",                                           "Rousseau — The Sleeping Gypsy",    0.50),
    ("Hiroshige_Utagawa,_oceano_di_Satta,_dalle_53_stazioni_del_tokaido,_1855.jpg",       "Hiroshige — Satta Pass",           0.50),
    ("James_Tissot_-_Jesus_Looking_through_a_Lattice.jpg",                                "Tissot — Biblical Illustration",   0.45),
]

# Searches that tend to pull the wrong file — veto these substrings outright.
SEARCH_BLOCKLIST = ("dmsp", "satellite", "from_space", "earth_lights")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def search_commons(query: str, limit: int = 8) -> list[str]:
    """Resolve a free-text query to File: titles on Wikimedia Commons."""
    q = urllib.parse.quote(query)
    url = (
        "https://commons.wikimedia.org/w/api.php"
        f"?action=query&list=search&srsearch={q}"
        f"&srnamespace=6&srlimit={limit}&format=json"
    )
    try:
        data = json.loads(fetch(url).decode("utf-8"))
    except Exception as err:
        print(f"    search failed: {err}")
        return []
    results = data.get("query", {}).get("search", [])
    titles: list[str] = []
    for r in results:
        title = r.get("title", "")
        if title.startswith("File:"):
            stripped = title[len("File:"):]
            if stripped.lower().endswith((".jpg", ".jpeg", ".png")):
                titles.append(stripped)
    return titles


def sepia(img: Image.Image) -> Image.Image:
    """Warm monochrome tint — amber-biased so it sits in the page's palette."""
    gray = ImageOps.grayscale(img)
    r = gray.point(lambda p: min(255, int(p * 1.00)))
    g = gray.point(lambda p: int(p * 0.78))
    b = gray.point(lambda p: int(p * 0.50))
    return Image.merge("RGB", (r, g, b))


def frame_vignette(size: tuple[int, int], strength: int = 80) -> Image.Image:
    """Small radial mask used to darken edges of each frame."""
    w, h = size
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([int(-w * 0.1), int(-h * 0.1), int(w * 1.1), int(h * 1.1)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.18))
    return mask


def treat(img: Image.Image, focus_y: float) -> Image.Image:
    fit = ImageOps.fit(img, (FRAME_W, FRAME_H), Image.LANCZOS, centering=(0.5, focus_y))
    fit = sepia(fit)
    fit = ImageEnhance.Brightness(fit).enhance(0.82)
    fit = ImageEnhance.Contrast(fit).enhance(1.10)
    fit = fit.filter(ImageFilter.GaussianBlur(0.3))

    # Soft radial vignette per frame
    mask = frame_vignette((FRAME_W, FRAME_H))
    dark = Image.new("RGB", (FRAME_W, FRAME_H), (4, 3, 2))
    fit = Image.composite(fit, dark, mask)

    # Subtle per-frame grain
    noise = Image.effect_noise((FRAME_W, FRAME_H), 22).convert("RGB")
    fit = Image.blend(fit, noise, 0.045)

    return fit


def try_fetch_file(filename: str) -> Image.Image | None:
    """Download a single Commons file with 3 retries; returns None on 404."""
    # Filenames may already contain %-encoding; only encode if raw unsafe chars exist.
    url = FP.format(name=filename)
    for attempt in range(3):
        try:
            if attempt > 0:
                time.sleep(2.0 * attempt)
            data = fetch(url)
            return Image.open(io.BytesIO(data)).convert("RGB"), data
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            print(f"    retry {attempt + 1}: HTTP {err.code}")
        except Exception as err:
            print(f"    retry {attempt + 1}: {err}")
    return None


def get_source(entry: tuple[str, str, float]) -> Image.Image | None:
    filename, label, _ = entry
    cache_key = filename.replace("%", "_").replace("/", "_").replace("?", "_")
    cache = CACHE_DIR / f"{cache_key}.bin"

    if cache.exists() and cache.stat().st_size > 0:
        try:
            return Image.open(io.BytesIO(cache.read_bytes())).convert("RGB")
        except Exception as err:
            print(f"    cache corrupt: {err}")

    # 1) canonical filename from the candidate list
    result = try_fetch_file(filename)
    if result is not None:
        img, raw = result
        cache.write_bytes(raw)
        return img

    # 2) fall back to a Commons search for the human label
    print(f"    canonical 404; searching for “{label}”...")
    for candidate in search_commons(label, limit=8):
        lower = candidate.lower()
        # skip obviously irrelevant files
        if any(s in lower for s in ("logo", "icon", "coat_of_arms", "signature",
                                    ".tif", "stamp", *SEARCH_BLOCKLIST)):
            continue
        # bias towards filenames containing a keyword from the label
        key_terms = [t.lower() for t in label.replace("—", " ").split() if len(t) > 3]
        if key_terms and not any(t in lower for t in key_terms):
            # accept at most once; bounded via second loop below
            continue
        print(f"    trying: {candidate}")
        encoded = urllib.parse.quote(candidate, safe=":()_.,-")
        result = try_fetch_file(encoded)
        if result is not None:
            img, raw = result
            if img.width < 600 or img.height < 600:
                continue
            cache.write_bytes(raw)
            print(f"    resolved: {candidate}")
            # stash the resolved name so the manifest can record truth
            entry_resolved[label] = candidate
            return img
        time.sleep(0.8)

    print(f"    unresolved: {label}")
    return None


# filled in as get_source() resolves via search; read back in build() for the manifest
entry_resolved: dict[str, str] = {}


def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # wipe any prior numbered frames to avoid stale leftovers
    for old in OUT_DIR.glob("*.jpg"):
        old.unlink()
    if (OUT_DIR / "manifest.json").exists():
        (OUT_DIR / "manifest.json").unlink()

    print(f"fetching {len(CANDIDATES)} candidates...")
    kept: list[dict] = []
    idx = 0
    for entry in CANDIDATES:
        filename, label, focus_y = entry
        print(f"  • {label}")
        src = get_source(entry)
        if src is None:
            continue
        treated = treat(src, focus_y)
        idx += 1
        name = f"{idx:02d}.jpg"
        treated.save(OUT_DIR / name, quality=JPEG_Q, optimize=True, progressive=True)
        resolved = entry_resolved.get(label, filename)
        kept.append({"n": idx, "file": name, "label": label, "source": resolved})
        time.sleep(0.15)  # be polite

    manifest = {
        "frame_width":  FRAME_W,
        "frame_height": FRAME_H,
        "count":        len(kept),
        "frames":       kept,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    # Inline JS version — for opening index.html via file:// where fetch() is blocked.
    (OUT_DIR / "manifest.js").write_text(
        "window.__REEL_MANIFEST = "
        + json.dumps(manifest, ensure_ascii=False)
        + ";\n"
    )

    total_kb = sum((OUT_DIR / f["file"]).stat().st_size for f in kept) / 1024
    print(f"\nkept {len(kept)} of {len(CANDIDATES)} frames -> {OUT_DIR.relative_to(ROOT)}")
    print(f"total on disk: {total_kb:.0f} KB")


if __name__ == "__main__":
    try:
        build()
    except KeyboardInterrupt:
        print("\ninterrupted")
        sys.exit(130)
