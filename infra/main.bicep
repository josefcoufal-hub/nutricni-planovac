// Nutriční plánovač – infrastruktura v Azure (Container Apps + Azure SQL Database serverless + ACR + Log Analytics).
// Nasazení ve dvou krocích (viz docs/NASAZENI-AZURE.md):
//   1) deployApps=false  -> vznikne registr, databáze, prostředí (obrazy ještě neexistují)
//   2) po nahrání obrazů do registru deployApps=true a názvy obrazů -> vzniknou obě aplikace
//
// POZOR: tato šablona nebyla v místě vzniku přeložena ani nasazena (nebyl k dispozici Azure CLI ani Bicep). Před prvním
// nasazením spusťte `az bicep build --file main.bicep` a `az deployment group what-if ...`.

targetScope = 'resourceGroup'

@description('Předpona názvů prostředků (3–12 malých písmen a číslic).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'planovac'

param location string = resourceGroup().location

@description('Přihlašovací jméno správce SQL serveru (nesmí být admin, sa, root apod.).')
param sqlAdminLogin string = 'planovacdb'

@secure()
@description('Heslo správce SQL serveru. Náhodné, min. 16 znaků.')
param sqlAdminPassword string

@secure()
@description('Tajemství pro podpis přihlašovacích tokenů (JWT), min. 32 znaků.')
param jwtSecret string

@secure()
@description('Sdílený klíč mezi webovou vrstvou a API, min. 24 znaků.')
param internalApiKey string

@description('Uživatelské jméno prvního správce aplikace (vytvoří se při prvním startu, pokud je zadáno i heslo).')
param bootstrapAdminUser string = 'admin'

@secure()
@description('Heslo prvního správce (min. 12 znaků). Po prvním přihlášení nechte prázdné, aby zůstalo mimo konfiguraci.')
param bootstrapAdminPassword string = ''

@description('Krok 2: vytvořit i aplikace (až po nahrání obrazů do registru).')
param deployApps bool = false

@description('Obraz API v registru, např. planovac-api:1.0.0')
param apiImage string = ''

@description('Obraz webu v registru, např. planovac-web:1.0.0')
param webImage string = ''

@description('Povolené veřejné IP adresy pro SQL server (např. odchozí IP aplikace). Prázdné = pravidlo „Povolit služby Azure“ (méně přísné).')
param sqlAllowedIps array = []

@description('Využít bezplatnou nabídku Azure SQL Database (100 000 vCore-sekund měsíčně, 32 GB). Po vyčerpání se databáze do konce měsíce pozastaví.')
param sqlFreeOffer bool = true

@description('Šifrovat provoz mezi aplikacemi uvnitř prostředí (mTLS).')
param peerEncryption bool = true

@description('Nejmenší počet běžících kopií webu (0 = vypne se při nečinnosti, první požadavek pak trvá déle).')
@minValue(0)
@maxValue(3)
param webMinReplicas int = 0

@description('Nejmenší počet běžících kopií API.')
@minValue(0)
@maxValue(3)
param apiMinReplicas int = 0

@description('Volitelně: přesný původ (https://adresa) vlastní domény pro kontrolu Origin. Prázdné = podle hlavičky Host.')
param publicOrigin string = ''

var suffix = uniqueString(resourceGroup().id)
var sqlServerName = 'sql-${namePrefix}-${suffix}'
var sqlDbName = 'planovac'
var acrName = take('acr${namePrefix}${suffix}', 50)
var apiName = '${namePrefix}-api'
var webName = '${namePrefix}-web'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

// ---------------------------------------------------------------- logování
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${namePrefix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.5') } // strop na náklady za logy
  }
}

// ---------------------------------------------------------------- registr obrazů a identita pro stahování
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namePrefix}-pull'
  location: location
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, pullIdentity.id, acrPullRoleId)
  properties: {
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// ---------------------------------------------------------------- databáze
resource sql 'Microsoft.Sql/servers@2025-01-01' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource db 'Microsoft.Sql/servers/databases@2025-01-01' = {
  parent: sql
  name: sqlDbName
  location: location
  sku: {
    name: 'GP_S_Gen5_1'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 34359738368 // 32 GB
    autoPauseDelay: 15
    minCapacity: json('0.5')
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
    useFreeLimit: sqlFreeOffer
    freeLimitExhaustionBehavior: sqlFreeOffer ? 'AutoPause' : null
  }
}

// Bez zadaných IP: pravidlo 0.0.0.0 = „povolit služby Azure“ (přístup z libovolného prostředku Azure, stále ale jen s heslem a TLS).
resource fwAzure 'Microsoft.Sql/servers/firewallRules@2025-01-01' = if (empty(sqlAllowedIps)) {
  parent: sql
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource fwIps 'Microsoft.Sql/servers/firewallRules@2025-01-01' = [for (ip, i) in sqlAllowedIps: {
  parent: sql
  name: 'allowed-${i}'
  properties: { startIpAddress: ip, endIpAddress: ip }
}]

// ---------------------------------------------------------------- prostředí Container Apps
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
    peerTrafficConfiguration: { encryption: { enabled: peerEncryption } }
    zoneRedundant: false
  }
}

var jdbcUrl = 'jdbc:sqlserver://${sql.properties.fullyQualifiedDomainName}:1433;database=${sqlDbName};encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=90'

var apiBootstrapEnv = empty(bootstrapAdminPassword) ? [] : [
  { name: 'BOOTSTRAP_ADMIN_USER', value: bootstrapAdminUser }
  { name: 'BOOTSTRAP_ADMIN_PASSWORD', secretRef: 'bootstrap-admin-password' }
]
var apiBootstrapSecrets = empty(bootstrapAdminPassword) ? [] : [
  { name: 'bootstrap-admin-password', value: bootstrapAdminPassword }
]

// ---------------------------------------------------------------- API (interní, z internetu nedostupné)
resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: apiName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${pullIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false // jen ostatní aplikace v tomto prostředí
        targetPort: 8081
        transport: 'http'
        allowInsecure: true // provoz zůstává uvnitř prostředí (a je šifrován, je-li zapnuté peerEncryption)
      }
      registries: [
        { server: acr.properties.loginServer, identity: pullIdentity.id }
      ]
      secrets: concat([
        { name: 'db-password', value: sqlAdminPassword }
        { name: 'jwt-secret', value: jwtSecret }
        { name: 'internal-key', value: internalApiKey }
      ], apiBootstrapSecrets)
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acr.properties.loginServer}/${apiImage}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat([
            { name: 'APP_ENV', value: 'production' }
            { name: 'PORT', value: '8081' }
            { name: 'STORAGE', value: 'sql' }
            { name: 'DB_URL', value: jdbcUrl }
            { name: 'DB_USER', value: sqlAdminLogin }
            { name: 'DB_PASSWORD', secretRef: 'db-password' }
            { name: 'DB_POOL_MAX', value: '5' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'INTERNAL_API_KEY', secretRef: 'internal-key' }
            { name: 'JWT_TTL_MIN', value: '480' }
          ], apiBootstrapEnv)
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/api/health', port: 8081 }
              initialDelaySeconds: 3
              periodSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 8081 }
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: apiMinReplicas
        maxReplicas: 2
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '30' } } }
        ]
      }
    }
  }
  dependsOn: [acrPull, db]
}

// ---------------------------------------------------------------- web (veřejná adresa, HTTPS)
resource web 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: webName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${pullIdentity.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false // HTTP se přesměruje na HTTPS
      }
      registries: [
        { server: acr.properties.loginServer, identity: pullIdentity.id }
      ]
      secrets: [
        { name: 'internal-key', value: internalApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acr.properties.loginServer}/${webImage}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat([
            { name: 'APP_ENV', value: 'production' }
            { name: 'PORT', value: '8080' }
            { name: 'API_URL', value: 'http://${apiName}' }
            { name: 'INTERNAL_API_KEY', secretRef: 'internal-key' }
            { name: 'UPSTREAM_TIMEOUT_MS', value: '110000' }
          ], empty(publicOrigin) ? [] : [
            { name: 'PUBLIC_ORIGIN', value: publicOrigin }
          ])
          probes: [
            { type: 'Startup', httpGet: { path: '/healthz', port: 8080 }, initialDelaySeconds: 2, periodSeconds: 3, failureThreshold: 10 }
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30, failureThreshold: 3 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10, failureThreshold: 3 }
          ]
        }
      ]
      scale: {
        minReplicas: webMinReplicas
        maxReplicas: 2
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '50' } } }
        ]
      }
    }
  }
  dependsOn: [acrPull, api]
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output sqlServerFqdn string = sql.properties.fullyQualifiedDomainName
output sqlDatabase string = sqlDbName
output webUrl string = deployApps ? 'https://${web.properties.configuration.ingress.fqdn}' : ''
