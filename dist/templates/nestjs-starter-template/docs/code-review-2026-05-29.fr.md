# Revue du backend NestJS — `nestjs-starter`

**Date :** 2026-05-29
**Réviseur :** Claude (skill `nestjs-backend-review`)
**Périmètre :** dépôt complet sur la branche `develop`
**Méthode :** cartographier le code, lancer des recherches catégorisées, lire les fichiers critiques, tracer les flux d'authentification et d'intégrité des données de bout en bout, puis classer les constats.

## Vue d'ensemble

Revue d'un starter NestJS de niveau entreprise (NestJS 10, Prisma 7, Passport JWT, Winston, Helmet, Throttler, AWS S3, nodemailer). Le bootstrap, le filtre d'exceptions, la pipe de validation et la couche Prisma sont solides, et les fondamentaux de sécurité sont présents (helmet, bcrypt, allowlist CORS, JWT signé HMAC, corps de requête nettoyés en logs, Prisma sans `synchronize`).

Le problème le plus important est que **la couche RBAC est mal câblée de bout en bout** : la stratégie JWT renvoie une forme d'utilisateur qui ne porte pas les tableaux `roles`/`permissions` à plat que les guards globaux `RolesGuard` et `PermissionsGuard` attendent, et toute une famille de décorateurs alternatifs `@Authorize` / `@AdminOnly` / `Can*Users` existe **sans qu'aucun guard ne lise sa métadonnée**. La combinaison est dangereuse car, selon le décorateur que l'on choisit, le même endpoint peut soit bloquer tout le monde (`@Roles('ADMIN')` → toujours refusé), soit laisser passer silencieusement n'importe qui (`@AdminOnly()` → no-op). Quelques autres points complètent le tableau : `getPresignedUrl` émet des URLs PUT au lieu de GET, le contrôleur S3 n'a aucun scoping par utilisateur ou rôle, le module throttler est configuré mais jamais enregistré comme guard, un mot de passe admin codé en dur est semé automatiquement en dev/staging, et le code de vérification d'e-mail utilise `Math.random`.

## Tableau récapitulatif

| #   | Constat                                                                                                                                                                                                                                                | Sévérité |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | RBAC silencieusement cassé : la forme de `request.user` ne correspond pas à ce que lisent `RolesGuard`/`PermissionsGuard`                                                                                                                              | 🔴 S1    |
| 2   | Les décorateurs `@Authorize`/`@AdminOnly`/`Can*Users` n'ont aucun guard pour les appliquer (autorisation silencieuse)                                                                                                                                  | 🔴 S1    |
| 3   | Les endpoints d'`AwsController` (upload/delete/presign) n'ont aucun contrôle de propriété ou de rôle — tout utilisateur connecté peut lire/écrire/supprimer n'importe quelle clé S3                                                                    | 🔴 S1    |
| 4   | `getPresignedUrl` émet une URL pré-signée **PUT** au lieu de GET — à la fois un bug fonctionnel et une exposition en écriture                                                                                                                          | 🔴 S1    |
| 5   | Mot de passe admin codé en dur `passwordAdmin` semé automatiquement en développement _et_ en staging                                                                                                                                                   | 🔴 S1    |
| 6   | `ThrottlerModule` configuré mais `ThrottlerGuard` non enregistré — aucun rate limiting sur login/register/reset                                                                                                                                        | 🟠 S2    |
| 7   | Le code de vérification d'e-mail utilise `Math.random()` (5 chiffres, ~17 bits d'entropie)                                                                                                                                                             | 🟠 S2    |
| 8   | L'erreur « compte désactivé » dans `validateUser` permet l'énumération d'utilisateurs sur `/auth/login`                                                                                                                                                | 🟠 S2    |
| 9   | `PermissionsGuard` / `RolesGuard` autorisent par défaut quand aucune métadonnée n'est posée (pas de deny-by-default)                                                                                                                                   | 🟠 S2    |
| 10  | `register` accepte des mots de passe plus faibles que `resetPassword` (6 caractères, sans complexité)                                                                                                                                                  | 🟠 S2    |
| 11  | `RegisterDto` laisse passer des `firstName`/`lastName` arbitraires ; `register()` les propage par arguments positionnels (impact faible aujourd'hui, mais la forme d'`update` posera problème dès qu'un endpoint de mise à jour de profil sera ajouté) | 🟡 S3    |
| 12  | Le flux `refreshTokens` n'est pas atomique entre `update`/`create` — une défaillance partielle peut révoquer sans réémettre                                                                                                                            | 🟡 S3    |
| 13  | La colonne `token` (hex) en base pour `RefreshToken` n'est jamais comparée au refresh — champ mort / modèle trompeur                                                                                                                                   | 🟡 S3    |
| 14  | `console.*` utilisés dans `sentry.config.ts`, `db-transport.ts`, `winston.config.ts` au lieu du logger du framework                                                                                                                                    | 🟡 S3    |
| 15  | `throw new Error(...)` dans des contrôleurs/services → renvoie HTTP 500 au lieu d'un 4xx                                                                                                                                                               | 🟡 S3    |
| 16  | `ValidationPipe` avec `forbidNonWhitelisted: false` — les champs inconnus du body sont silencieusement supprimés au lieu d'être rejetés                                                                                                                | 🟡 S3    |
| 17  | `S3Client` instancié même sans credentials (simple `warn`) — échecs runtime silencieux en aval                                                                                                                                                         | 🟢 S4    |
| 18  | `UsersModule` est un placeholder vide toujours câblé dans le module racine                                                                                                                                                                             | 🟢 S4    |
| 19  | L'import de `LogsModule` est commenté dans `app.module.ts` — fonctionnalité orpheline                                                                                                                                                                  | 🟢 S4    |
| 20  | `JwtPayload.email` / `roles` sont optionnels dans le type, mais `login()` les pose toujours — dérive de type                                                                                                                                           | 🟢 S4    |

---

## 🔴 S1 — Critique

### 1. RBAC cassé : `RolesGuard`/`PermissionsGuard` cherchent des champs absents de `request.user`

**Emplacement :** `src/modules/auth/strategies/jwt.strategy.ts:21-23`, `src/modules/auth/auth.service.ts:314-341`, `src/common/guards/roles.guard.ts:27`, `src/common/guards/permissions.guard.ts:27`

```ts
// jwt.strategy.ts
async validate(payload: JwtPayload): Promise<UserWithRoles> {
  return this.authService.validateJwtPayload(payload);   // renvoie UserWithRoles (pas de .roles / .permissions à plat)
}

// auth.service.ts (validateJwtPayload)
const { password: _, ...result } = user;
return result as UserWithRoles;                          // inclut user.userRoles[].role.permissions[] – imbriqué, pas à plat

// roles.guard.ts
const userRoles = user.roles || [];                      // <- user.roles est undefined → []
const hasRole = requiredRoles.some(role => userRoles.includes(role));   // toujours false → ForbiddenException

// permissions.guard.ts
const userPermissions = user.permissions || [];          // <- idem : toujours []
```

**Pourquoi c'est un problème :** les guards globaux s'appuient sur une forme aplatie (`user.roles: string[]`, `user.permissions: string[]`) qui n'existe que dans le payload JWT et dans `UserResponse`. Le retour de `JwtStrategy.validate()` devient `request.user` et correspond à la forme Prisma imbriquée (`userRoles[].role…`). Toute route protégée par `@Roles('ADMIN')` ou `@RequirePermissions('users:read')` refusera **chaque** appelant, y compris l'admin semé. Aujourd'hui cela ne touche que `LogsController` (lui-même commenté — voir #19), donc le bug est latent — mais il cassera silencieusement le premier endpoint RBAC ajouté.

**Recommandation :** dans `validateJwtPayload`, aplatir avant de renvoyer, et resserrer le type pour que le contrat des guards soit imposé par le compilateur :

```ts
const roles = user.userRoles?.map((ur) => ur.role.name) ?? [];
const permissions =
  user.userRoles?.flatMap((ur) => ur.role.permissions?.map((rp) => rp.permission.name) ?? []) ?? [];
return { ...result, roles, permissions } as UserWithRoles & {
  roles: string[];
  permissions: string[];
};
```

Rendre `roles`/`permissions` obligatoires dans le type que les guards consomment, afin que le compilateur attrape les régressions futures.

---

### 2. Les décorateurs `@Authorize` / `@AdminOnly` / `Can*Users` existent sans guard qui les lit — autorisation silencieuse

**Emplacement :** `src/common/decorators/authorize.decorator.ts:1-68`, `src/app.module.ts:78-89` (providers de guards)

```ts
// authorize.decorator.ts
export const AUTHORIZATION_KEY = 'authorization';
export const Authorize = (rules: AuthorizationRule): MethodDecorator =>
  SetMetadata(AUTHORIZATION_KEY, rules);
export const AdminOnly = (): MethodDecorator => Authorize({ roles: ['ADMIN'] });
export const CanCreateUsers = (): MethodDecorator => Authorize({ permissions: ['users:create'] });
```

`grep -r AUTHORIZATION_KEY src` montre que la clé n'est référencée que dans le fichier du décorateur — aucun `AuthorizeGuard` ne la consomme. Les guards globaux dans `app.module.ts:78-89` sont `JwtAuthGuard`, `RolesGuard` (`ROLES_KEY`) et `PermissionsGuard` (`PERMISSIONS_KEY`) ; aucun ne lit `AUTHORIZATION_KEY`.

**Pourquoi c'est un problème :** la documentation à la Swagger dans ce fichier de décorateurs invite un développeur futur à poser `@AdminOnly()` sur une route privilégiée. La route passera `JwtAuthGuard` (tout utilisateur connecté), ne verra pas de `ROLES_KEY`/`PERMISSIONS_KEY`, et sera **silencieusement autorisée**. C'est le piège classique du « ça ressemble à de la sécurité, c'est en fait de la décoration ».

**Recommandation :** soit implémenter un `AuthorizeGuard` qui lit `AUTHORIZATION_KEY` (en déléguant aux vérifications de rôles/permissions, en gérant `requireAll`), soit supprimer `authorize.decorator.ts` entièrement et standardiser sur `@Roles` / `@RequirePermissions`. Si le fichier est gardé, ajouter un test unitaire qui échoue dès que `AUTHORIZATION_KEY` est posé sur une route sans guard d'application.

---

### 3. Les endpoints d'`AwsController` n'ont aucun scoping de propriété ou de rôle — tout utilisateur connecté peut lire/écrire/supprimer n'importe quelle clé S3

**Emplacement :** `src/modules/aws/aws.controller.ts:33-188`

```ts
@Controller('aws')
@UseGuards(JwtAuthGuard)              // <- uniquement « est connecté »
export class AwsController {
  @Post('upload') ...
  @Delete(':key')   async deleteFile(@Param('key') key: string) { ... }
  @Get('presigned-url/:key') async getPresignedUrl(@Param('key') key: string, ...) { ... }
}
```

Aucun `@Roles`, aucun `@RequirePermissions`, aucune vérification de préfixe/propriété par utilisateur. Le schéma Prisma ne lie aucune clé S3 à un utilisateur. Combiné à `body-parser.json({ limit: '5mb' })` et `FilesInterceptor('files', 10)` (10 × ≈ 50 Mo par requête, sans restriction MIME/taille), tout utilisateur vérifié ou non (`isEmailVerified` n'est imposé nulle part) peut :

- Uploader du contenu arbitraire (y compris des types exécutables) dans le bucket configuré — à des clés contrôlées par l'attaquant via `customKey` si exposé, ou à des clés prévisibles `${Date.now()}-${file.originalname}`.
- Supprimer n'importe quel objet du bucket en devinant/connaissant les clés (ex. `logs/error-2026-05-29.log.gz` — exactement le motif que `winston.config.ts:74` écrit).
- Générer une URL pré-signée pour n'importe quelle clé (et à cause du #4, cette URL accorde aussi un accès **en écriture**).

**Pourquoi c'est un problème :** les trois se combinent en une primitive read/write/delete S3 à l'échelle du tenant, restreinte uniquement à « possède un compte ». Pour un starter destiné à être cloné, cela ne devrait pas être livré tel quel.

**Recommandation :**

- Protéger le contrôleur avec `@Roles('ADMIN')` (ou un jeu de permissions `files:*` dédié) jusqu'à ce que la propriété par utilisateur soit modélisée.
- Ajouter une table Prisma `Files` (`id, userId, s3Key, mime, size, …`) et résoudre les opérations via la base afin que les appelants ne puissent agir que sur leurs propres lignes.
- En attendant, imposer côté serveur un préfixe de clé dérivé de `request.user.id`, valider les types MIME et la taille, et rejeter `..` ou un `/` en tête de `:key`.

---

### 4. `getPresignedUrl` émet une URL PUT au lieu de GET

**Emplacement :** `src/modules/aws/aws.service.ts:142-150` (et `src/modules/aws/aws.controller.ts:159-188`)

```ts
async getPresignedUrl(key: string, bucketName?: string, expiresIn = 3600) {
  ...
  const command = new PutObjectCommand({                 // <- devrait être GetObjectCommand
    Bucket: bucket,
    Key: key,
  });
  const url = await getSignedUrl(this.s3Client, command, { expiresIn });
  ...
}
```

**Pourquoi c'est un problème :** deux modes de défaillance à la fois. (a) L'endpoint est documenté et nommé « Get a presigned URL for a file » — ce qu'il renvoie en fait est une URL d'**upload** temporaire. N'importe qui qui appelle `/aws/presigned-url/some-key` peut ensuite `PUT` des octets arbitraires à `some-key` pendant une heure. (b) `LogsService.generatePresignedUrls` (`src/modules/logs/logs.service.ts:78-101`) remet ces URLs aux admins pour qu'ils téléchargent les fichiers de logs roulés — ces téléchargements ne fonctionneront jamais car l'URL est signée pour `PUT`. Effet combiné : le viewer de logs est cassé, et le contrôleur AWS est une primitive write-anywhere.

**Recommandation :** importer et utiliser `GetObjectCommand` dans `getPresignedUrl`. Conserver `PutObjectCommand` uniquement pour une méthode `getPresignedUploadUrl` séparée et explicitement nommée, soumise aux mêmes changements d'autorisation que le #3.

---

### 5. Mot de passe admin codé en dur semé automatiquement en développement _et_ en staging

**Emplacement :** `src/modules/database/seed.service.ts:55-65`, `:254-275` ; plus les credentials par défaut qui fuient dans `src/main.ts:96-101`

```ts
// seed.service.ts
async onModuleInit() {
  const nodeEnv = this.configService.get<string>('app.nodeEnv');
  if (nodeEnv === 'production') return this.log('Skipping auto-seed in production');
  await this.seed();                                     // <- s'exécute en development ET en staging
}
private async seedAdminUser(adminRole: Role) {
  const hashedPassword = await bcrypt.hash('passwordAdmin', bcryptRounds);
  const adminUser = await this.prisma.user.create({
    data: { email: 'kaeyros.admin@yopmail.com', password: hashedPassword, ... },
  });
}

// main.ts (publié aussi dans la description Swagger)
//  **Email:** kaeyros.admin@yopmail.com
//  **Password:** passwordAdmin
```

**Pourquoi c'est un problème :** le garde-fou est `nodeEnv === 'production'`, or `nodeEnv` est `NODE_ENV` (convention Node) alors que le reste du code aiguille les environnements sur `APP_ENV` (voir `configuration.ts:159-162`). Un déploiement staging qui suit la convention `APP_ENV=staging`, `NODE_ENV=production` finit par ne pas seeder (bon pour staging-prod) — mais un déploiement qui pose `APP_ENV=staging`, `NODE_ENV=development` (par exemple pour des logs verbeux) hérite d'un compte admin avec des credentials publiquement documentés. Pire, ces credentials sont reproduits littéralement dans la description Swagger, que `main.ts:49` sert dès que `swagger.enabled` est vrai — activé par défaut hors production.

**Recommandation :**

- Aiguiller le seed sur `app.appEnv` et limiter l'auto-seed à `development` uniquement.
- Ne pas semer un mot de passe utilisable ; à la place, au premier boot, générer un mot de passe aléatoire, l'imprimer une fois sur stdout, et forcer un reset au premier login (ou exiger une variable d'env `INITIAL_ADMIN_PASSWORD` et refuser de démarrer sans elle).
- Retirer le bloc de credentials de la description Swagger dans `main.ts:96-101`, ou ne le rendre que lorsque `appEnv === 'development'`.

---

## 🟠 S2 — Élevé

### 6. `ThrottlerGuard` non enregistré — login/register/password-reset ne sont pas throttlés

**Emplacement :** `src/app.module.ts:53-62, 70-100`

```ts
ThrottlerModule.forRootAsync({ ... }),    // <- module importé et configuré
// providers: les APP_GUARD sont JwtAuthGuard, RolesGuard, PermissionsGuard — pas de ThrottlerGuard
```

**Pourquoi c'est un problème :** le README/Swagger annoncent « 100 req/60s par IP », mais seul le _module_ est câblé. Sans `{ provide: APP_GUARD, useClass: ThrottlerGuard }` (ou `@UseGuards(ThrottlerGuard)` par contrôleur), aucune requête n'est throttlée. `/auth/login`, `/auth/register`, `/auth/request-password-reset` sont tous `@Public()` et acceptent un trafic illimité — énumération, credential stuffing, spam de reset.

**Recommandation :** ajouter `{ provide: APP_GUARD, useClass: ThrottlerGuard }` dans `AppModule.providers`. Appliquer un `@Throttle` plus strict aux routes d'auth/reset (par exemple 5 req/min/IP).

---

### 7. Le code de vérification d'e-mail utilise `Math.random()`

**Emplacement :** `src/modules/auth/auth.service.ts:566-568`

```ts
private generateVerificationCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
```

**Pourquoi c'est un problème :** ce code est la seule chose qui sépare un utilisateur authentifié d'un `isEmailVerified: true`. 90 000 valeurs possibles sont attaquables par force brute en quelques secondes sans rate limiting (voir #6) — et même avec le throttler, `Math.random` n'est pas un CSPRNG. De plus, les codes restent valides 24 h.

**Recommandation :** utiliser `crypto.randomInt(10000, 100000)`, raccourcir le TTL (par exemple 15 min), plafonner les tentatives par code, et envisager des codes à 6 chiffres.

---

### 8. La vérification du statut du compte avant le mot de passe permet l'énumération d'utilisateurs

**Emplacement :** `src/modules/auth/auth.service.ts:55-66`

```ts
if (!user) return null;
if (!user.isActive || user.deletedAt) {
  throw new UnauthorizedException('Account is disabled'); // <- erreur différente entre désactivé et inconnu
}
const isPasswordValid = await bcrypt.compare(password, user.password);
if (!isPasswordValid) return null; // <- LocalStrategy le transforme en « Invalid credentials »
```

**Pourquoi c'est un problème :** la réponse distingue « email existe mais désactivé » de « email inconnu » de « mauvais mot de passe ». Un attaquant peut énumérer les emails enregistrés en sondant la réponse. L'endpoint de reset de mot de passe adopte déjà la bonne approche (`auth.service.ts:410-418`) ; le login devrait s'aligner.

**Recommandation :** toujours exécuter `bcrypt.compare` (y compris contre un hash factice quand aucun user n'existe) et renvoyer la même erreur générique `Invalid credentials` pour tous les modes d'échec. Journaliser le cas du compte désactivé côté serveur.

---

### 9. `PermissionsGuard` / `RolesGuard` autorisent par défaut quand aucune métadonnée n'est posée

**Emplacement :** `src/common/guards/permissions.guard.ts:10-18`, `src/common/guards/roles.guard.ts:10-18`

```ts
const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [...]);
if (!requiredPermissions) return true;   // <- autorise si pas de métadonnée
```

**Pourquoi c'est un problème :** combinée à `JwtAuthGuard` qui passe en premier, la politique effective est « tout utilisateur authentifié peut atteindre toute route qui ne porte pas explicitement `@RequirePermissions` ». C'est l'inverse du deny-by-default. Un développeur qui oublie d'annoter une nouvelle méthode de contrôleur livre un endpoint ouvert. Ce motif est précisément la cause du #3 (le contrôleur AWS n'a ni rôle ni permission, et est donc grand ouvert à tout utilisateur connecté).

**Recommandation :** rendre le guard deny-by-default — en l'absence de `PERMISSIONS_KEY` (et de rôle, et sans `@Public()`), lever `ForbiddenException`. À coupler avec un décorateur explicite `@Authenticated()`/`@AnyUser()` pour le cas rare « il suffit d'être connecté », afin que l'intention soit visible sur chaque route.

---

### 10. `register` autorise des mots de passe plus faibles que `reset-password`

**Emplacement :** `src/modules/auth/dto/auth.dto.ts:21-23` vs. `src/modules/auth/dto/reset-password.dto.ts:18-25`

```ts
// register
@MinLength(6)
password: string;

// reset
@MinLength(8)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, ...)
newPassword: string;
```

**Pourquoi c'est un problème :** un utilisateur peut s'inscrire avec `aaaaaa`, ne jamais faire de reset, et le système ne peut même pas le savoir. La règle de complexité au reset implique une politique ; elle devrait s'appliquer dès l'entrée.

**Recommandation :** centraliser la règle (validateur personnalisé `IsStrongPassword`, ou un DTO de base partagé) et l'appliquer aux deux. Exécuter le validateur également dans `auth.service.register` en défense en profondeur.

---

## 🟡 S3 — Moyen

### 11. `RegisterDto` permet à l'appelant de fournir des `firstName`/`lastName` arbitraires ; le risque de mass-assignment est contenu aujourd'hui mais pas par design

**Emplacement :** `src/modules/auth/auth.service.ts:148-171`, `src/modules/auth/dto/auth.dto.ts:25-33`

`register()` n'écrit que des champs explicites, donc tout va bien aujourd'hui. Mais le précédent posé par `RegisterDto` (`@IsOptional()` ouverts sur des strings, sans plafond de longueur) et l'absence de règle projet contre `...dto`/`...body` mordra dès qu'un endpoint de mise à jour de profil sera ajouté. Plafonner les longueurs (`@MaxLength`), nettoyer les espaces, et envisager une sanitization.

### 12. `refreshTokens` n'est pas atomique

**Emplacement :** `src/modules/auth/auth.service.ts:251-300`

Le flux : vérifier le JWT → charger l'enregistrement → vérifier l'utilisateur → `prisma.refreshToken.update({ isRevoked: true })` (ligne 287) → signer un nouvel access token → `generateRefreshToken` (qui de son côté révoque-puis-crée à travers son propre `updateMany`+`create`). Rien de tout cela n'est encapsulé dans `$transaction`. Un échec entre la révocation de l'ancien token et la création du nouveau laisse l'utilisateur sans aucun refresh token valide. Envelopper toute la rotation dans `prisma.$transaction(async tx => { ... })` et propager `tx` dans `generateRefreshToken`.

### 13. La colonne hex `token` de `RefreshToken` n'est jamais comparée

**Emplacement :** `src/modules/auth/auth.service.ts:201-230` (`generateRefreshToken`) vs. `:256-261` (lookup par `payload.tokenId` uniquement)

```ts
const tokenValue = crypto.randomBytes(64).toString('hex');
...
await this.prisma.refreshToken.create({ data: { token: tokenValue, userId, expiresAt } });

// plus tard, dans refreshTokens()
const tokenRecord = await this.prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
```

La valeur hex est écrite, indexée, marquée `@unique` — et jamais lue. Elle ne fait aucun travail car la signature JWT authentifie déjà la requête. Soit comparer le hex embarqué dans le JWT à la colonne en base (de sorte que voler un token nécessite d'avoir à la fois le JWT et la ligne DB qui matchent), soit retirer la colonne.

### 14. Appels `console.*` dans des chemins de code production

**Emplacement :** `src/config/sentry.config.ts:11,16,22,26,51,76`, `src/common/logging/db-transport.ts:51`, `src/common/logging/winston.config.ts:66`, `src/main.ts:176`

`Sentry.init` et le callback d'upload S3 sur rotation contournent tous deux le logger configuré, donc ces messages n'apparaissent pas dans les transports fichier/DB et ne sont pas structurés. Injecter `LoggerService` (déjà global) ou utiliser `Logger` de Nest. Le fallback du bootstrap dans `main.ts:176` est légitime — à ce stade, le logger peut ne pas être disponible — à conserver.

### 15. `throw new Error(...)` dans des services/contrôleurs → HTTP 500

**Emplacement :** `src/modules/aws/aws.controller.ts:77, 130` ; `src/modules/aws/aws.service.ts:57, 106, 139, 169, 174` ; `src/modules/email/email.service.ts:91, 207`

```ts
if (!file) throw new Error('No file provided'); // devient 500, fuite « No file provided » en InternalServerError
```

Ce sont des erreurs d'entrée client ou de configuration. Utiliser `BadRequestException` pour les cas contrôleur (ou s'appuyer sur les validators `ParseFilePipe`/`@UploadedFile()`), et `InternalServerErrorException` typé seulement quand la mauvaise configuration est réellement côté serveur.

### 16. `ValidationPipe` accepte silencieusement les champs inconnus

**Emplacement :** `src/common/pipes/validation.pipe.ts:22-23`

```ts
whitelist: true,
forbidNonWhitelisted: false,    // <- les champs inconnus sont silencieusement supprimés
```

Un client qui poste `{ email, password, isAdmin: true }` reçoit un 201 avec `isAdmin` discrètement strippé. Mieux vaut rejeter explicitement pour que les frontends détectent les fautes de frappe et les tentatives de mass-assignment : poser `forbidNonWhitelisted: true`. Envisager aussi `transform: true` — sans cette option, les décorateurs `@Type()` sur des DTOs de query (ex. `pagination.dto.ts`) ne fonctionnent que parce que `plainToInstance` est appelé manuellement ici, mais une future bascule vers `useGlobalPipes(new NestValidationPipe())` casserait silencieusement.

---

## 🟢 S4 — Faible

### 17. `AwsService` construit le client S3 même sans credentials

`src/modules/aws/aws.service.ts:25-35` prévient via `warn` puis continue avec `accessKeyId: ''`. Tout upload ultérieur échoue avec une erreur AWS confuse. Lever `InternalServerErrorException('AWS not configured')` paresseusement au premier usage, ou refuser d'enregistrer le provider en production sans credentials.

### 18. `UsersModule` est un placeholder vide

`src/modules/users/users.module.ts:1-11` et l'import dans `src/app.module.ts:13,66`. Soit l'implémenter, soit le supprimer pour éviter les collisions `nest g` et le bruit dans le graphe des modules.

### 19. L'import de `LogsModule` est commenté

`src/app.module.ts:15,68`. Toute la feature logs (contrôleur, service, tests) embarque dans le binaire mais n'est jamais enregistrée. Soit la réactiver (et corriger #4 d'abord), soit supprimer le module mort.

### 20. `JwtPayload.email` / `roles` sont optionnels mais toujours présents en écriture

`src/types/auth.types.ts:3-9` — les champs sont `?`, mais `auth.service.ts:89-93` les pose toujours. Resserrer le type pour retirer les `?`, afin que les consommateurs n'écrivent pas de checks défensifs `payload.roles ?? []`.

---

## Ordre de remédiation recommandé

1. **Réparer la pipeline RBAC** avant tout (#1 + #2 + #9). Tant que `request.user` ne porte pas `roles`/`permissions` à plat _et_ qu'aucun guard ne lit `AUTHORIZATION_KEY` _et_ que la valeur par défaut n'est pas « deny », toute décision d'autorisation dans ce code est en comportement indéfini.
2. **Verrouiller le contrôleur AWS** (#3 + #4). Passer de `PutObjectCommand` à `GetObjectCommand`, protéger chaque endpoint, et ajouter un modèle de fichiers par utilisateur — ce sont aujourd'hui des primitives bucket joignables publiquement.
3. **Retirer le mot de passe admin codé en dur** (#5) et le bloc de credentials dans Swagger.
4. **Enregistrer `ThrottlerGuard` globalement** et resserrer les throttles d'auth (#6) ; basculer le code de vérification vers un CSPRNG (#7) ; uniformiser les erreurs de login (#8).
5. **Renforcer la politique de mot de passe et la validation** (#10, #16) avant le prochain formulaire utilisateur.
6. **Rotation de refresh atomique** (#12) et soit retirer soit utiliser réellement la colonne hex (#13).
7. Hygiène du logger (#14, #15) et nettoyage des modules morts (#18, #19) en une PR groupée.

## Compétences à renforcer

- **Conception de l'autorisation** — séparer « authentifié » de « autorisé » ; deny-by-default ; faire du contrat `request.user` une partie du type du guard pour que le compilateur impose la compatibilité.
- **Modèle de menace fichiers-comme-tenants** — ne jamais exposer des routes S3 génériques adressées par clé ; toujours projeter les clés sur un propriétaire.
- **Maîtrise du SDK AWS** — `Put*Command` vs `Get*Command` pour les URLs pré-signées est exactement le genre d'incohérence qu'un wrapper typé (ou un test contractuel qui fait un HEAD contre l'URL) attraperait.
- **Tests d'intégration des guards** — un seul test d'intégration qui frappe une route annotée en tant qu'`ADMIN` puis en tant qu'utilisateur ordinaire aurait fait remonter le #1 immédiatement.
