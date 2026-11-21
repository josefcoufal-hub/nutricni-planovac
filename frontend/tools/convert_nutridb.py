#!/usr/bin/env python3
# Převod exportu NutriDatabáze (CSV, windows-1250, středník) na src/nutridb.js
import csv, io, json, re, sys, collections
src, out = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
try: txt = raw.decode('utf-8')
except UnicodeDecodeError: txt = raw.decode('cp1250')
rows = list(csv.reader(io.StringIO(txt), delimiter=';', skipinitialspace=True))
H = [h.strip() for h in rows[0]]
ix = {h: i for i, h in enumerate(H)}
def num(r, k):
    v = (r[ix[k]] if k in ix and ix[k] < len(r) else '').strip().replace(',', '.')
    if v in ('', '-'): return None
    try: return float(v)
    except ValueError: return None

def has(n, words): return any(w in n for w in words)
def starts(n, words): return any(n.startswith(w) for w in words)

FISH = ['kapr', 'losos', 'treska', 'pstruh', 'tuňák', 'sleď', 'sardink', 'makrel', 'štik', 'candát', 'amur', 'cejn', 'lín ', 'lín,', 'koryfén', 'platýs', 'siven', 'úhoř', 'tolstolob', 'okoun', 'sumec', 'mník', 'ostroun', 'jeseter', 'ančov', 'pangas', 'tilápie', 'halibut', 'kranas', 'mořský', 'ryb', 'plotice', 'jack', 'hejk', 'štikozub', 'kapr', 'candát', 'jikry', 'losos', 'treska', 'platýz', 'mořčák', 'sardel', 'belice', 'bolen', 'cejn']
SHELL = ['kreve', 'krab', 'humr', 'langust', 'rak ', 'raci']
MOLL = ['mušle', 'slávk', 'ústřic', 'chobotnic', 'kalamár', 'hlemýžď', 'sépie', 'škeble']
EXTRA = [
    ('ryby', ['hoki', 'kambala', 'solea', 'morčák', 'šprot', 'tlamoun', 'žralok']),
    ('maso', ['dršťky', 'oháňka', 'orebice', 'škvarky']),
    ('tuky', ['ghee', 'máslo kakaové', 'bio-margarín', 'margarín']),
    ('orechy', ['máslo arašídové', 'máslo z', 'konopné máslo', 'vlašské máslo', 'ostropestřec']),
    ('doplnky', ['protein', 'maltodextrin', 'inulin', 'karagenan', 'psyllium', 'guarana', 'vosk', 'šrot sojový', 'hmota kakaová', 'baobab', 'lucuma']),
    ('mlecne', ['permeát', 'retentát', 'zákys', 'výrobek mléčný']),
    ('napoje', ['destilát', 'whisky']),
    ('vejce', ['melanž']),
    ('pecivo', ['strouhanka', 'dalamánek', 'piškot']),
    ('sladkosti', ['melasa', 'pralinky', 'tabulková', 'buchty', 'bábovka', 'mazanec', 'závin', 'palačinka', 'škubánky', 'rohlíčky']),
    ('priloha', ['bér', 'kroupy', 'šrot žitný', 'trhanka', 'hranolky', 'placky bramborové', 'křibice', 'špaldové pukance']),
    ('zelenina', ['fenykl, bulva', 'hlíva', 'kopr', 'okra', 'patizon', 'polníček', 'romanesco', 'ředkev', 'shiitake', 'žampiony', 'výhonky', 'mungo', 'rosička', 'pastiňák', 'ježatka', 'jidášovo', 'kořen černý', 'lečo']),
    ('ovoce', ['citróny', 'feijoa', 'granadilla', 'guave', 'hloh', 'jujuba', 'cherimoya', 'karambola', 'kiwáno', 'marakuja', 'nashi', 'opuncie', 'physalis', 'rambutan', 'salak', 'sapodilla', 'tamarillo', 'temnoplodec', 'papaya', 'euterpe', 'jeřáb', 'klikva', 'mochyně', 'josta', 'klanopraška', 'aloe']),
]
def cat_of(name):
    n = name.lower().strip()
    if starts(n, ['maso', 'játra', 'srdce', 'žaludky', 'jazyk', 'ledviny', 'droby', 'párky', 'párek', 'salám', 'luncheon', 'paštik', 'šunk', 'klobás', 'slanin', 'uzen', 'kůže', 'cvrčc', 'mouční červi', 'špek', 'tlačenk', 'jitrnic', 'jelito', 'gothaj', 'mortadel', 'zabijačk', 'vepřov', 'hovězí', 'kuřec', 'krůtí', 'králík', 'zajíc', 'křepelka', 'kachna', 'husa', 'holoubě', 'perlička', 'bažant', 'koroptev', 'srnčí', 'jelen', 'divoké', 'kančí', 'mufloní', 'skopov', 'jehněčí', 'telecí', 'koňsk', 'kůzle', 'sečí', 'kolagen']): return 'maso'
    if has(n, ['rybí olej', 'olej rybí', 'olej, rybí', 'rybí tuk']): return 'tuky'
    if has(n, SHELL + MOLL) or any(n.startswith(w.strip()) for w in FISH) or re.search(r'\b(ryb|sleď|treska|losos|kapr|pstruh|tuňák|sardink|makrel)', n): return 'ryby'
    if starts(n, ['vejce', 'bílek', 'žloutek', 'vaječ']): return 'vejce'
    if has(n, ['kokosové mléko', 'mléko kokos', 'ovesný nápoj', 'sójový nápoj', 'mandlový nápoj', 'rýžový nápoj', 'mléko sójov', 'mléko mandl', 'mléko rýž', 'mléko oves']): return 'napoje'
    if starts(n, ['sýr', 'tvaroh', 'jogurt', 'smetana', 'mléko', 'podmáslí', 'syrovátka', 'kefír', 'máslo', 'tavený', 'zmrzlina', 'jogurtov', 'mléčn', 'acidofil', 'kysan', 'zakysan', 'cottage', 'mozzarell', 'eidam', 'ementál', 'parmaz', 'brynza', 'tvarůžky']) and not has(n, ['kakaov', 'arašíd', 'lískoo', 'mandlov', 'ořech']): return 'mlecne'
    if starts(n, ['chléb', 'chleba', 'rohlík', 'houska', 'pečivo', 'bageta', 'toust', 'veka', 'koláč', 'croissant', 'bulka', 'rohlíky', 'žemle', 'perník', 'lupínky', 'chipsy']): return 'pecivo'
    if starts(n, ['fazol', 'čočk', 'hrách', 'cizrn', 'sója', 'sójov', 'tofu', 'tempeh', 'lupin', 'bob ', 'edamame', 'boby ']) and not has(n, ['kakaov', 'omáčka']): return 'luskoviny'
    if starts(n, ['olej', 'tuk', 'margarín', 'sádlo', 'ghí', 'shortening', 'omega']): return 'tuky'
    if starts(n, ['víno', 'pivo', 'lihovin', 'nápoj', 'džus', 'šťáva', 'káva', 'čaj', 'voda', 'limonád', 'cola', 'kola', 'mošt', 'cider', 'koktejl', 'energetick', 'minerální', 'ovocný nápoj', 'smoothie', 'kakao nápoj']): return 'napoje'
    if starts(n, ['cukr', 'čokolád', 'med', 'sirup', 'bonbón', 'džem', 'marmelád', 'sušenk', 'oplatk', 'kokosový cukr', 'stévi', 'slad', 'karamel', 'nugát', 'marcipán', 'puding', 'pudink', 'bonbon', 'lízátk', 'želé', 'sacharin', 'sladidlo', 'xylitol', 'erythritol', 'fruktóz', 'dextróz', 'glukóz', 'cukrovin', 'halva', 'žvýkačk']): return 'sladkosti'
    if starts(n, ['rýže', 'těstovin', 'brambor', 'bulgur', 'kuskus', 'pohank', 'krupic', 'mouka', 'vločky', 'otruby', 'kukuřic', 'pšenic', 'oves', 'proso', 'quinoa', 'amarant', 'škrob', 'bramborák', 'knedlík', 'ječmen', 'žito', 'špalda', 'cereál', 'müsli', 'musli', 'popcorn', 'nudle', 'noky', 'halušk', 'gnocchi', 'bezlepk', 'klíčky', 'mannová', 'pir', 'kamut', 'jáhly', 'sago', 'tapioka', 'maniok', 'batát']): return 'priloha'
    if starts(n, ['ořech', 'mandle', 'arašíd', 'semena', 'semínk', 'lískoo', 'pistác', 'kešu', 'sezam', 'mák', 'kokos', 'pekan', 'kaštan', 'tahini', 'burák', 'chia', 'len ', 'slunečnic', 'dýňov']): return 'orechy'
    if starts(n, ['bílkovin', 'protein', 'vláknin', 'droždí', 'kvasnic', 'guma', 'želatin', 'maca', 'prášek', 'mořan', 'řasa', 'spirulin', 'chlorell', 'kolagen', 'lecitin', 'agar', 'pektin', 'kasein', 'kreatin', 'extrakt', 'doplněk', 'kyselin', 'vitamin', 'boby kakaov', 'kakao', 'carob', 'rohovník']): return 'doplnky'
    if starts(n, ['koření', 'omáčka', 'kečup', 'hořčice', 'majonéza', 'ocet', 'sůl', 'bujón', 'pizza', 'protlak', 'dresink', 'pesto', 'pomazánk', 'zálivka', 'polévk', 'vývar', 'marináda', 'kvas', 'lečo']): return 'ostatni'
    if starts(n, ['paprika', 'cibule', 'celer', 'mrkev', 'zelí', 'kapust', 'brokolic', 'květák', 'cuket', 'dýně', 'okurk', 'rajčat', 'salát', 'špenát', 'houby', 'hřib', 'petrž', 'česnek', 'řepa', 'hrášek', 'kopřiv', 'křen', 'olivy', 'fazolky', 'pór', 'ředkv', 'chřest', 'lilek', 'špenat', 'mangold', 'kedlub', 'tykev', 'artyčok', 'pažitk', 'kerblík', 'rukola', 'čekanka', 'pangrt', 'pastinák', 'topinamb', 'zázvor', 'kukuřice cukrová', 'rebarbor', 'tuřín', 'sladké brambor', 'bambus', 'lopuch', 'růžičk', 'čínské', 'pak choi', 'kimchi', 'kvašen', 'sterilov', 'mražen', 'zeleninov', 'rostlin']): return 'zelenina'
    if starts(n, ['ananas', 'banán', 'brusink', 'jablk', 'meruňk', 'třešn', 'švestk', 'hrušk', 'malin', 'ostružin', 'broskv', 'mango', 'kiwi', 'fík', 'pomeranč', 'citron', 'rybíz', 'jahod', 'višn', 'pitahaj', 'rakytník', 'hrozn', 'meloun', 'rozink', 'datle', 'borůvk', 'angrešt', 'kumquat', 'mirabelk', 'šípk', 'kaktusový', 'dřišťál', 'bez černý', 'grapefruit', 'mandarink', 'nektarink', 'avokádo', 'papája', 'granátov', 'liči', 'guava', 'kaki', 'ostružiník', 'moruše', 'klouč', 'ovoce', 'ovocn', 'limetk', 'pomelo', 'kokos', 'durian', 'maracuj', 'tamarind', 'jeřabin', 'černý rybíz', 'plantain', 'kdoule', 'rajčiny', 'aronie', 'goji', 'acai']): return 'ovoce'
    for c2, ws in EXTRA:
        if has(n, ws): return c2
    return 'ostatni'

GLUTEN_FLOUR_OK = ['bezlepk', 'rýžov', 'kukuřičn', 'pohankov', 'bramborov', 'sójov', 'kaštanov', 'mandlov', 'kokosov', 'cizrnov', 'jáhlov', 'amarantov', 'quinoa', 'lupinov', 'čočkov', 'hrachov', 'tapiokov', 'rohovník', 'konopn', 'lněn', 'ovesn', 'banánov']
def allergens(name, cat):
    n = name.lower(); a = []
    free = 'bezlepk' in n
    GL = ['pšeni', 'žitn', 'žito', 'ječ', 'špald', 'kamut', 'oves', 'těstovin', 'kuskus', 'bulgur', 'otruby', 'seitan', 'sladov', 'pivo', 'knedlík', 'pizza', 'rohlík', 'chléb', 'chleba', 'houska', 'pečivo', 'bageta', 'toust', 'perník', 'sušenk', 'oplatk', 'müsli', 'musli', 'cereál', 'nudle', 'strouhank', 'piškot', 'koláč', 'croissant', 'žemle', 'veka', 'bulka', 'těsto', 'dalamánek', 'durum']
    if not free and not has(n, ['svatojánsk']) and (has(n, GL) or re.search(r'\bslad\b', n)): a.append('gluten')
    if has(n, ['kreve', 'krab', 'humr', 'langust']) or re.search(r'\brak\b|\braci\b', n): a.append('crustaceans')
    if (starts(n, ['vejce', 'bílek', 'žloutek']) or has(n, ['vajíčk', 'majonéz', 'vaječn', 'melanž'])) and not has(n, ['nevaječ', 'bezvaječ']): a.append('eggs')
    if cat == 'ryby' and not has(n, SHELL + MOLL) or has(n, ['rybí', 'ančov', 'rybích']): a.append('fish')
    if has(n, ['arašíd', 'burák']): a.append('peanuts')
    if has(n, ['sója', 'sójov', 'tofu', 'tempeh', 'edamame', 'miso', 'sójová']) or starts(n, ['sója']): a.append('soy')
    if (cat == 'mlecne' and not has(n, ['kakaov'])) or has(n, ['mléčn', 'mléko', 'smetan', 'tvaroh', 'jogurt', 'sýr', 'syrovátk', 'kasein', 'podmáslí', 'kefír', 'máslo', 'zmrzlin']) and not has(n, ['kokosov', 'mandlov', 'sójov', 'ovesn', 'rýžov', 'arašíd', 'kakaov', 'lískoo', 'ořech', 'oříšk', 'burák', 'sezam', 'tahini']): a.append('milk')
    if has(n, ['mandle', 'mandlov', 'ořech', 'ořech', 'lískoo', 'lískov', 'oříšk', 'pistác', 'kešu', 'pekan', 'nugát', 'marcipán']) and not has(n, ['muškátov', 'kokosov', 'kokosový ořech', 'arašíd']): a.append('nuts')
    if has(n, ['celer']): a.append('celery')
    if has(n, ['hořčic', 'hořčičn']): a.append('mustard')
    if has(n, ['sezam', 'tahini']): a.append('sesame')
    if has(n, ['víno', 'sulfit']) or ((has(n, ['sušen']) and cat == 'ovoce') and not has(n, ['lyofil'])): a.append('sulphites')
    if has(n, ['lupin']): a.append('lupin')
    if has(n, MOLL): a.append('molluscs')
    if has(n, ['hamburger', 'burger', 'nugget', 'mcchicken', 'langoš', 'smaženka', 'smažený sýr', 'strouhank', 'trhanka', 'piškot', 'dalamánek', 'buchty', 'bábovk', 'mazanec', 'závin', 'palačink', 'škubánk', 'rohlíčk', 'šrot žitný', 'špaldov', 'kroupy', 'omáčka sójov', 'hranolky']) and 'gluten' not in a: a.append('gluten')
    if has(n, ['cheeseburger', 'smažený sýr', 'pralinky', 'mléčné čokol', 'čokoláda mléč', 'smetanov', 'buchty', 'bábovk', 'mazanec', 'palačink', 'škubánk', 'permeát', 'retentát', 'zákys', 'výrobek mléčný', 'omáčka svíčková', 'ghee', 'rohlíčk']) and 'milk' not in a: a.append('milk')
    if has(n, ['bábovk', 'palačink', 'piškot', 'mazanec', 'buchty', 'burger', 'nugget', 'mcchicken', 'smaženka', 'smažený sýr', 'langoš', 'melanž', 'strouhanka', 'rohlíčk']) and 'eggs' not in a: a.append('eggs')
    if has(n, ['sojov', 'omáčka sójov', 'šrot sojový']) and 'soy' not in a: a.append('soy')
    if has(n, ['svíčková', 'celer']) and 'celery' not in a: a.append('celery')
    return sorted(set(a), key=lambda x: ['gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs'].index(x))

seen = set(); out_rows = []; skipped = []; cats = collections.Counter()
for r in rows[1:]:
    if not r or len(r) < 10: continue
    code = r[ix['OrigFdCd']].strip(); name = r[ix['OrigFdNm']].strip()
    if not name or code in seen: skipped.append((code, name, 'duplicita/prázdný')); continue
    seen.add(code)
    kcal = num(r, 'ENERC [kcal]'); kj = num(r, 'ENERC [kJ]')
    if kcal is None and kj is not None: kcal = round(kj / 4.184)
    prot = num(r, 'PROT [g]'); fat = num(r, 'FAT [g]')
    fib = num(r, 'FIBT [g]'); cho = num(r, 'CHO [g]'); chot = num(r, 'CHOT [g]')
    if cho is None and chot is not None: cho = max(0.0, chot - (fib or 0))
    if kcal is None or prot is None or fat is None or cho is None:
        skipped.append((code, name, 'chybí energie nebo hlavní živina')); continue
    sat = num(r, 'FASAT [g]'); sug = num(r, 'SUGAR [g]')
    na = num(r, 'NA [mg]'); nacl = num(r, 'NACL [g]')
    salt = round(na * 2.5 / 1000, 2) if na is not None else nacl
    if sat is not None and sat > fat + 0.05: sat = fat
    if sug is not None and sug > cho + 0.5: sug = None
    c = cat_of(name); cats[c] += 1
    out_rows.append([code, name, c, round(kcal), round(prot, 1), round(fat, 1), None if sat is None else round(sat, 1), round(cho, 1), None if sug is None else round(sug, 1), None if fib is None else round(fib, 1), salt if salt is None else round(salt, 2), allergens(name, c)])
js = '/* Vygenerováno tools/convert_nutridb.py z exportu NutriDatabáze (ÚZEI/Nutridatabaze.cz, v 11.26). Hodnoty na 100 g jedlého podílu.\n   [kód, název, kategorie, kcal, bílkoviny, tuky, nasycené, sacharidy (využitelné), cukry, vláknina, sůl, alergeny]\n   Alergeny jsou odvozeny automaticky z názvu potraviny. */\n(function (root) {\n  var NT = (root.NT = root.NT || {});\n  NT.NUTRIDB = ' + json.dumps(out_rows, ensure_ascii=False, separators=(',', ':')).replace('],[', '],\n[') + ';\n})(typeof window !== "undefined" ? window : globalThis);\n'
open(out, 'w', encoding='utf-8').write(js)
print('řádků:', len(out_rows), 'přeskočeno:', len(skipped), skipped[:40])
print(cats.most_common())
json.dump(out_rows, open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False)
