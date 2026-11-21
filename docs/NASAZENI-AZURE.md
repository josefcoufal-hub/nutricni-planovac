# Nasazení do Microsoft Azure

Postup je psaný pro člověka, který Azure zná jen zběžně. Celé nasazení obstará jeden skript; níže je popsáno, co dělá, jak aplikaci spravovat a co dělat při potížích.

> **Důležité upozornění.** Šablona `infra/main.bicep`, skript `infra/deploy.sh`, Dockerfiles a `pom.xml` byly napsány a zkontrolovány podle dokumentace Microsoftu, ale **nebyly v místě vzniku spuštěny** (nebyl dostupný Azure CLI, Docker daemon ani Maven repozitář). První nasazení proto berte jako ověření: nejdřív `what-if`, pak ostré nasazení do prázdné skupiny prostředků, kterou lze celou smazat. Výjimkou je PostgreSQL varianta SQL příkazů (ověřeno na PostgreSQL 16) a obě aplikační vrstvy (ověřeny testy, viz `README.md`).

## 1. Co budete potřebovat

- předplatné Azure (stačí placené „pay-as-you-go“; bezplatná nabídka SQL se uplatní automaticky)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) a přihlášení: `az login`
- `openssl` (je na Linuxu, macOS i v Git Bash na Windows)
- oprávnění vlastníka (Owner) nebo správce přístupu u cílové skupiny prostředků – skript vytváří přiřazení role `AcrPull`

## 2. Nasazení jedním příkazem

```bash
./infra/deploy.sh rg-planovac germanywestcentral
```

Skript postupně:

1. vytvoří skupinu prostředků a **vygeneruje tajemství** (heslo SQL, podpisový klíč tokenů, sdílený klíč web↔API, heslo prvního správce) do souboru `.secrets.env` s právy jen pro vás. Soubor nikdy neukládejte do gitu a zálohujte si ho (bez něj nejde bezpečně znovu nasadit se stejnými hesly),
2. nasadí `infra/main.bicep` **bez aplikací** (registr obrazů, databáze, prostředí),
3. sestaví a nahraje oba obrazy do registru (`az acr build`, sestavení běží v Azure, Docker na vašem počítači není potřeba),
4. nasadí šablonu znovu **s aplikacemi** a vypíše adresu.

Doporučený postup před ostrým během: ve druhém kroku si šablonu zkontrolujte ručně

```bash
az bicep build --file infra/main.bicep          # kontrola syntaxe
az deployment group what-if -g rg-planovac -f infra/main.bicep \
  -p sqlAdminPassword=x jwtSecret=x internalApiKey=x deployApps=false
```

### Co se vytvoří

| Prostředek | Účel | Poznámka k nákladům |
|---|---|---|
| Container Apps prostředí + 2 aplikace (`planovac-web` veřejná, `planovac-api` interní) | běh Node.js a Javy | 0,25 vCPU / 0,5 GiB každá, **škálují se na nulu** při nečinnosti |
| Azure SQL Database, serverless, bezplatná nabídka | data | 100 000 vCore-s a 32 GB měsíčně zdarma; po vyčerpání se **do konce měsíce pozastaví** (nic se neúčtuje) |
| Container Registry (Basic) | obrazy aplikací | jediná pevná měsíční položka (řádově 5 USD) |
| Log Analytics | logy | omezeno na 0,5 GB/den, uchování 30 dní |
| Spravovaná identita | stahování obrazů z registru | zdarma |

### Výběr oblasti (ověřeno při prvním nasazení)

Výchozí oblast je `germanywestcentral` (Frankfurt, data zůstávají v EU). U zkušebního předplatného **`westeurope` selhalo** s chybou `RequestDisallowedByAzure ... locationineligible` (oblast nepřijímá nové zákazníky). Jiná oblast se zadává druhým parametrem skriptu; před nasazením ji lze ověřit příkazem `what-if` s `-p location=<oblast>`. Při prvním nasazení prošly `germanywestcentral` i `swedencentral`.

### Odhad nákladů

Při běžné práci jednoho terapeuta (několik hodin denně) se aplikace vejdou do měsíčních bezplatných limitů Container Apps (podle Microsoftu 180 000 vCPU-s, 360 000 GiB-s a 2 milióny požadavků) i SQL. Reálně tedy platíte hlavně registr obrazů, **řádově jednotky USD měsíčně**. Částky ověřte v [kalkulátoru cen Azure](https://azure.microsoft.com/pricing/calculator/); ceny registru a Log Analytics zde nejsou ověřeny a mohou se lišit. Náklady zvýšíte, když nastavíte `webMinReplicas`/`apiMinReplicas` na 1 (aplikace pak běží stále) nebo vypnete bezplatnou nabídku SQL (`sqlFreeOffer=false`).

Bezplatná nabídka SQL: lze ji uplatnit u omezeného počtu databází na předplatné; oblast první takové databáze platí pro další. Pokud by šablona uplatnění odmítla (chybová zpráva u `useFreeLimit`), vytvořte databázi jednou v portálu přes „Apply free offer“, zjistěte její parametry příkazem `az sql db show` a upravte `sku` v šabloně.

## 3. První přihlášení

1. Otevřete adresu vypsanou na konci (`https://planovac-web.<…>.azurecontainerapps.io`).
2. Přihlaste se jako `admin`; heslo je v `.secrets.env` (`BOOTSTRAP_ADMIN_PASSWORD`).
3. **Hned si heslo změňte:** Nastavení → Účet a zabezpečení → Změnit heslo.
4. Příští nasazení spouštějte s `NO_BOOTSTRAP=1 ./infra/deploy.sh rg-planovac`, aby heslo prvního správce nezůstávalo v konfiguraci. (První správce se vytváří jen tehdy, když v databázi nejsou žádní uživatelé, takže jeho ponechání nehrozí přepsáním, jde o úklid.)

**První otevření po delší nečinnosti trvá až minutu.** Probouzí se kontejnery i databáze (po 60 minutách nečinnosti se pozastaví; při vypnuté bezplatné nabídce po 15). Přihlašovací obrazovka to uživateli vysvětlí. Chcete-li zkrátit čekání, nastavte `webMinReplicas=1` (za cenu pevných nákladů).

## 4. Správa uživatelů

Správce vytváří další uživatele v **Nastavení → Uživatelé**: Nový uživatel (jméno, zobrazované jméno, role, heslo – lze vygenerovat). Každý uživatel vidí jen svá data. Tamtéž lze nastavit nové heslo (uživatele to odhlásí ze všech zařízení) nebo uživatele zakázat/povolit. Zapomenuté heslo se řeší právě tímto „Nové heslo“.

**Zámek po špatných heslech** (5 pokusů) sám vyprší za 15 minut. **Zapomenuté heslo** nelze obnovit e-mailem; resetuje ho jiný správce. Pokud heslo zapomněl jediný správce, jde to nouzově přes databázi:

1. Vygenerujte hash nového hesla (heslo se čte ze vstupu, nezůstane v historii příkazů):
   ```bash
   echo -n 'nové-silné-heslo-2026' | java -cp api/target/planovac-api.jar cz.planovac.api.HashPassword
   ```
2. V portálu otevřete SQL databázi → Query editor (přihlaste se jako správce SQL; může být nutné přidat vaši IP do firewallu serveru) a spusťte:
   ```sql
   UPDATE dbo.users SET pw_hash = '<vypsaný hash>', failed_attempts = 0, locked_until = 0, token_version = token_version + 1
   WHERE username = 'admin';
   ```
   `token_version + 1` zneplatní všechna stará přihlášení.

## 5. Aktualizace aplikace

```bash
NO_BOOTSTRAP=1 ./infra/deploy.sh rg-planovac
```

Znovu použije uložená tajemství, sestaví nové obrazy (verze = datum a čas) a vytvoří novou revizi. Data v databázi zůstávají. Změna `JWT_SECRET` by všechny odhlásila, tajemství se proto při opakovaném nasazení nemění.

## 6. Zálohy a obnova

- **Databáze:** Azure SQL zálohuje automaticky (obnova k určitému času); u bezplatné nabídky je zahrnuto 32 GB záloh. Dobu uchování ověřte v portálu: SQL databáze → Obnovení.
- **Zálohy dat z aplikace:** Nastavení → Stáhnout zálohu (JSON) vytvoří úplnou zálohu dat přihlášeného uživatele. Doporučuji ji stahovat pravidelně, je nezávislá na Azure.
- **Tajemství:** soubor `.secrets.env` uschovejte (např. v password manageru).

## 7. Zpřísnění zabezpečení (doporučeno po prvním ověření)

Výchozí stav je bezpečný pro malou praxi, ale tyto kroky riziko dál snižují:

1. **Databázový uživatel s nejnižším oprávněním.** Aplikace se nyní připojuje jako správce SQL serveru. Vytvořte omezeného uživatele a změňte `DB_USER`/`DB_PASSWORD` (v portálu: Query editor jako správce):
   ```sql
   CREATE USER planovac_app WITH PASSWORD = '<silné heslo>';
   ALTER ROLE db_datareader ADD MEMBER planovac_app;
   ALTER ROLE db_datawriter ADD MEMBER planovac_app;
   ALTER ROLE db_ddladmin  ADD MEMBER planovac_app;
   ```
2. **Firewall SQL serveru.** Výchozí pravidlo „povolit služby Azure“ pouští dovnitř libovolný prostředek Azure (stále ale jen s heslem a TLS). Zjistěte odchozí adresy aplikace a předejte je šabloně:
   ```bash
   az containerapp show -g rg-planovac -n planovac-api --query properties.outboundIpAddresses -o tsv
   # pak nasazení s parametrem sqlAllowedIps=["x.x.x.x", ...]
   ```
   (Název vlastnosti `outboundIpAddresses` nebyl v dokumentaci ověřen; nevrátí-li příkaz nic, najdete adresy v portálu u prostředí Container Apps.) Adresy se mohou při opětovném vytvoření prostředí změnit.
3. **Vlastní doména a certifikát** (Container Apps → Custom domains, spravovaný certifikát zdarma). Po přidání nastavte parametr `publicOrigin=https://vase-domena.cz`.
4. **Tajemství v Azure Key Vault** místo tajemství aplikace (Container Apps umí odkaz na Key Vault přes spravovanou identitu).
5. **Přihlašování přes Microsoft Entra ID** místo hesel (vhodné, pokud bude uživatelů víc).
6. **Písma z Google Fonts** odesílají IP adresu uživatele společnosti Google. Pro přísné GDPR si písma Inter a Space Grotesk stáhněte do `frontend` a servírujte je z vlastního serveru (upravit `build.js` a CSP `font-src`/`style-src`).
7. **Knihovny z cdnjs** (PDF, XLSX): stáhněte je do `web/public/vendor` a upravte `App.loadScript` adresy i CSP; odpadne závislost na třetí straně.

## 8. Ověření po nasazení

- [ ] `https://<adresa>/healthz` vrací `{"status":"ok"}`
- [ ] `https://<adresa>/api/health` vrací `{"status":"ok","ready":true}` (po probuzení databáze)
- [ ] přihlášení funguje, cookie v prohlížeči (F12 → Aplikace → Cookies) se jmenuje `__Host-nt_session` a má HttpOnly, Secure, SameSite=Strict
- [ ] **PDF export a import XLSX fungují** (načítají se z cdnjs; Content-Security-Policy je omezuje na konkrétní verze, v konzoli nesmí být „Refused to load…“)
- [ ] v logu (`az containerapp logs show -g rg-planovac -n planovac-web --follow`) je u požadavků **skutečná IP klienta**, ne adresa proxy. Pokud je tam adresa Azure, `TRUST_PROXY` nebere správnou hodnotu `X-Forwarded-For` a omezení počtu pokusů by platilo pro všechny uživatele najednou.
- [ ] `https://<adresa>/` přes `http://` se přesměruje na HTTPS
- [ ] SQL vrstvu zkontrolujte testem proti databázi (z vašeho počítače, po přidání vaší IP do firewallu serveru):
  ```bash
  cd api && ./build.sh test >/dev/null && mvn -B -q -DskipTests package   # build.sh maže target/, proto před Mavenem
  DB_URL='jdbc:sqlserver://<server>.database.windows.net:1433;database=planovac;encrypt=true;loginTimeout=90' \
  DB_USER=<správce> DB_PASSWORD='<heslo>' SELFTEST_CONFIRM=yes \
  java -cp "target/planovac-api.jar:target/lib/*:out-test" cz.planovac.api.SqlSelfTest
  ```
  (použijte raději samostatnou testovací databázi; test po sobě své záznamy maže)

## 9. Řešení potíží

| Příznak | Pravděpodobná příčina | Co udělat |
|---|---|---|
| Přihlášení trvá minutu, pak „Databáze se právě spouští“ | databáze byla pozastavená | zkuste znovu; opakovaně to po probuzení nedělá |
| Přihlášení hlásí „Server je dočasně nedostupný“ (502/504) | API se spouští nebo neběží | `az containerapp logs show -n planovac-api …`; zkontrolujte `DB_URL`, heslo a firewall SQL |
| 403 „ochrana proti CSRF“ po přidání vlastní domény | `Origin` neodpovídá | nastavte `publicOrigin` na přesnou adresu s `https://` |
| Po přihlášení okamžitě zase přihlašovací obrazovka | cookie se neukládá (nesedí `Secure`, jiná doména) | otevírejte aplikaci přes `https://` |
| Nasazení kroku 3 selže na stažení obrazu | role `AcrPull` se ještě nerozšířila | počkejte pár minut a spusťte skript znovu |
| `useFreeLimit` nebo SKU odmítnuto | bezplatná nabídka nelze uplatnit (jiná oblast, limit počtu) | viz poznámka v oddílu 2 |
| Databáze „zmizela“ koncem měsíce | vyčerpán měsíční limit bezplatné nabídky (AutoPause) | počkejte na další měsíc nebo nastavte `sqlFreeOffer=false` (placeno) |

## 10. Smazání všeho

```bash
az group delete -n rg-planovac --yes --no-wait
```
Smaže všechny prostředky včetně databáze a dat. Předtím si stáhněte zálohy z aplikace.
