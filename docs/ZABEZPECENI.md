# Zabezpečení

Tento dokument popisuje, co aplikace dělá pro ochranu dat, kde jsou její meze a co zbývá na vás. Aplikace pracuje se **zdravotními údaji klientů**, které patří podle GDPR do zvláštní kategorie osobních údajů. Dokument není právní poradenství.

## 1. Přehled ochran

| Oblast | Co aplikace dělá | Kde je to v kódu / jak je to ověřeno |
|---|---|---|
| **Uložení hesel** | Hesla se neukládají, jen hash PBKDF2-HMAC-SHA256, 600 000 iterací, náhodná 16bajtová sůl na heslo. Porovnání v konstantním čase. Při zvýšení počtu iterací se hash sám přepočítá při příštím přihlášení. | `Passwords.java`; testy hash/verify/rehash |
| **Pravidla pro hesla** | min. 12 a max. 200 znaků, nesmí se rovnat jménu, nesmí být ze seznamu běžných hesel, aspoň 4 různé znaky | `Passwords.policyError`; testováno |
| **Zámek účtu** | po 5 chybách zámek na 15 minut, i když je zadáno správné heslo. Stejně se chovají i neexistující jména, takže nelze zjistit, které účty existují (stejná odpověď, stejná doba zpracování díky „falešnému“ hashi). | `AuthService.login`; testováno vč. neexistujícího jména |
| **Omezení počtu požadavků** | webová vrstva: 20 pokusů o přihlášení / 15 min a 600 požadavků / min na IP adresu | `web/src/app.js`; testováno |
| **Relace** | JWT (HS256, platnost 8 h) uložený **jen v cookie** `__Host-nt_session` s příznaky `HttpOnly; Secure; SameSite=Strict; Path=/`. JavaScript v prohlížeči token nevidí a v těle odpovědí není. | testy: token není v odpovědi, cookie příznaky (jednotkově i v prohlížeči) |
| **Okamžité zneplatnění** | každý token nese číslo verze uživatele; změna hesla, „odhlásit ze všech zařízení“ a zakázání účtu zvýší verzi a všechny staré tokeny přestanou platit. | testováno na úrovni API, webu i prohlížeče |
| **CSRF** | tři vrstvy: `SameSite=Strict`, kontrola hlavičky `Origin` (a `Sec-Fetch-Site`), povinná vlastní hlavička `X-NT-CSRF` u každé změny | `web/src/app.js`; testy včetně cizího Origin |
| **XSS** | Content-Security-Policy: skripty jen z vlastního serveru a dvou konkrétních verzí knihoven na cdnjs, žádné vložené skripty ani obsluhy událostí; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`. Vkládaná data se ve vykreslování escapují. | testováno v prohlížeči (bez porušení CSP) |
| **Další hlavičky** | HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP, `Cache-Control: no-store` u API | `web/src/app.js` |
| **Odděleno od internetu** | Java API má **interní** ingress (z internetu nedostupné); navíc vyžaduje sdílený klíč od webové vrstvy. Web předává dál jen vyjmenované cesty (ostatní → 404), bez parametrů v adrese. | `infra/main.bicep`, testy „bez klíče 403“ |
| **Izolace dat uživatelů** | každý dotaz na dokumenty filtruje podle `owner_id` z ověřeného tokenu, nikdy z požadavku | testováno: uživatel nevidí a nemůže přepsat ani smazat cizí data |
| **Injekce** | veškeré SQL jsou parametrizované (`PreparedStatement`), identifikátory a kolekce jsou omezeny regulárním výrazem, JSON se čte přísným parserem (hloubka ≤ 64, bez zbytků), velikost dokumentu ≤ 1 MB | testy: `'; DROP TABLE`, `../`, `%2e%2e`, příliš velké, špatný typ |
| **Přenos** | TLS 1.2+ na veřejné adrese (spravuje Azure), HSTS; spojení s databází vynuceně šifrované (`encrypt=true`, ověřený certifikát); provoz mezi aplikacemi lze šifrovat (parametr `peerEncryption`) | `infra/main.bicep` |
| **Tajemství** | nejsou v kódu ani v obrazu; jsou to tajemství Container Apps (hodnoty se v portálu nezobrazují); lokálně `.secrets.env` s právy 600 | `infra/deploy.sh` |
| **Úložiště** | Azure SQL šifruje data v klidu (TDE) ve výchozím nastavení | nastavení Azure, ověřte v portálu |
| **Záznamy událostí** | tabulka `audit` (přihlášení, neúspěchy, zámek, změny hesel a uživatelů, IP adresa), uchování 180 dní, žádná hesla ani těla požadavků. Logy aplikace neobsahují cookies ani těla. | `AuthService`, `Log.java` |
| **Poctivé chyby** | chyby nevyzrazují interní detaily; „špatné jméno“ a „špatné heslo“ vypadají stejně | testováno |

## 2. Proti čemu aplikace chrání a proti čemu ne

| Hrozba | Stav |
|---|---|
| Uhodnutí / vyzkoušení hesel (útok hrubou silou) | **chráněno** zámkem účtu, omezením na IP, náročným hashem, požadavky na heslo |
| Únik databáze | hesla jsou jen jako hash; **zdravotní data v databázi jsou ale čitelná** (šifrována jen „v klidu“ platformou). Tomu brání jen přístup k databázi (firewall, silné heslo, případně dále privátní koncový bod). |
| Odcizení cookie (např. malware v počítači) | token platí do vypršení (8 h) nebo do „odhlásit ze všech zařízení“/změny hesla. Odhlášení na jednom zařízení maže jen cookie na něm, **neruší token** (je bezstavový). |
| Škodlivý web otevřený ve stejném prohlížeči (CSRF) | **chráněno** (viz výše) |
| Vložený skript (XSS) | **omezeno** CSP a escapováním; povolené je `style="…"` ve stylech (aplikace jich používá mnoho), skripty ne |
| Zásah z internetu přímo do Java API / databáze | **chráněno** interním ingressem + sdíleným klíčem; databáze má firewall |
| Zlomyslný správce nebo útočník s právy v Azure | **nechráněno** – správce Azure vidí tajemství a může číst databázi |
| Útok na dodavatelský řetězec | omezeno tím, že obě vrstvy nemají žádné knihovny; zbývá základní obraz Node/Java, JDBC ovladač a dvě knihovny z cdnjs (bez kontroly integrity SRI) |

## 3. Co zatím není (a kdy to doplnit)

- **Dvoufaktorové ověření (MFA)** – nejsilnější další krok. Doporučené řešení: přihlášení přes Microsoft Entra ID (Container Apps umí „Authentication“ bez změny kódu) nebo TOTP v aplikaci.
- **Obnova hesla e-mailem** – chybí záměrně (nutí poštovní službu a další útočnou plochu); resetuje správce, nouzově viz `docs/NASAZENI-AZURE.md`.
- **Počítadla pokusů pro neexistující jména a omezení na IP** jsou v paměti jedné kopie aplikace. Při více kopiích platí každá zvlášť; zámek skutečných účtů je ale v databázi sdílený. (Aplikace je nastavena na max. 2 kopie.)
- **Šifrování na úrovni sloupců** (Always Encrypted) není. Vhodné zvážit u vyšších nároků.
- **Penetrační test** a skenování závislostí neproběhly.
- **Databázový uživatel s minimálními právy** – výchozí nasazení používá správce SQL serveru; viz zpřísnění v `docs/NASAZENI-AZURE.md`.
- **Firewall SQL** – výchozí pravidlo „služby Azure“ je širší, než je ideální; viz tamtéž.
- **Důvěra v hlavičku `X-Forwarded-For`**: aplikace bere *poslední* hodnotu (přidává ji ingress Azure). Správné chování ověřte po nasazení (kontrolní seznam v `docs/NASAZENI-AZURE.md`).
- **Aplikační AI** je v serverové verzi vypnuta; při jejím doplnění (Azure OpenAI) je potřeba řešit, jaká data se odesílají.

## 4. GDPR – praktická doporučení (nejde o právní radu)

- Údaje o zdraví jsou zvláštní kategorie (čl. 9 GDPR). Ujasněte si **právní základ** a roli: terapeut je zpravidla správce, Microsoft zpracovatel (zpracovatelská smlouva je součástí podmínek Microsoftu – ověřte). Zvažte posouzení vlivu (DPIA) a záznamy o činnostech zpracování.
- **Oblast dat:** výchozí `westeurope` (Nizozemsko). Data neopouštějí EU, pokud sami nenastavíte jinak.
- **Minimalizace:** doporučte klienty zapisovat zkráceně (jméno + iniciála, číslo) a nezapisovat rodná čísla ani kontakty. Aplikace na to upozorňuje v Nastavení.
- **Výmaz a přenositelnost:** Nastavení → *Stáhnout zálohu* (export JSON), *Smazat všechna data* (výmaz dat uživatele). Smazání jednoho klienta řeší jeho karta.
- **Písma Google Fonts** odesílají IP adresu návštěvníka Googlu – pro přísnější přístup je lokálně hostujte (viz zpřísnění).
- **Doba uchování:** auditní záznamy 180 dní; zálohy databáze podle nastavení Azure.
- **Porušení zabezpečení:** mějte připravený postup (komu hlásit, do 72 hodin úřadu pro ochranu osobních údajů). Logy najdete v Log Analytics.

## 5. Kontrolní seznam před ostrým provozem

- [ ] SQL test (`SqlSelfTest`) proti testovací Azure SQL databázi prošel
- [ ] heslo prvního správce změněno, `NO_BOOTSTRAP=1` při dalším nasazení
- [ ] vytvořen databázový uživatel s minimálními právy, `DB_USER` přepnut
- [ ] firewall SQL zúžen na adresy aplikace
- [ ] ověřena skutečná IP klienta v logu, PDF/XLSX fungují, v konzoli žádné chyby CSP
- [ ] `.secrets.env` zálohován mimo repozitář
- [ ] u každého, kdo aplikaci používá, jasně určená role a vlastní účet (nesdílet účty)
- [ ] rozhodnuto o právním základu a zpracovatelské smlouvě
