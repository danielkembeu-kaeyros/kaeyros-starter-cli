# Architecture admins/utilisateurs — analyse comparative

**Date :** 2026-05-29
**Auteur :** Claude
**Périmètre :** réimplémentation des modules `auth` et `users` du starter NestJS
**Question :** quelle est l'architecture typique pour séparer admins et utilisateurs, sachant que les admins ne doivent jamais apparaître dans les endpoints de liste d'utilisateurs publics, et quelle est la plus sécurisée ?

## Ce que font réellement les produits de référence

La quasi-totalité des SaaS modernes utilise **une seule table d'identité**, la séparation étant assurée par les chemins d'accès, pas par la disposition des tables :

- **Stripe, Linear, Vercel, Notion, Slack, GitHub** — une seule table `User`/`Account` ; le statut d'admin vit dans une relation de _membership_ ou de rôle
- **Auth0, Clerk, Supabase, Firebase Auth** — un seul magasin d'utilisateurs ; admin est un scope/claim
- **Django** — une seule table `User` avec des flags `is_staff` / `is_superuser`
- **Rails Devise** — une seule table d'utilisateurs avec un gem de rôles par-dessus
- **Stripe Dashboard** — UI/domaine séparé (`dashboard.stripe.com` vs l'API), mais **le même magasin d'identités** derrière

Les cas où l'on voit réellement des **tables d'identité physiquement séparées** :

- **Contextes à forte assurance** — banques, santé, gouvernement — où la défense en profondeur au niveau du schéma est une exigence de conformité
- **Systèmes acquis ou hérités** qui ont grandi avec des auths séparées et ne les ont jamais fusionnées
- **Entreprises multi-produits** avec des consoles opérateur totalement indépendantes (par exemple AWS IAM « root » historiquement vs IAM users — la recommandation actuelle d'AWS est de **ne jamais utiliser le compte root** parce que ce modèle à deux tables a engendré ses propres pièges)

Donc : **la séparation à deux tables n'est pas le défaut moderne**, et elle n'est pas catégoriquement plus sécurisée. Elle protège contre une classe de bugs précise (« j'ai oublié le filtre `WHERE kind = 'USER'` ») tout en en introduisant d'autres (collisions d'email entre les tables, plomberie d'authentification dupliquée, le JWT doit encoder quelle table consulter, chaque nouvelle feature doit choisir vers quelle table pointer ses FK).

## Le vrai modèle de menace

Ce qui fait réellement fuiter des admins dans les listes d'utilisateurs, par fréquence dans les incidents de production :

1. **Vérification d'autorisation oubliée** sur un endpoint — corrigée par des guards, pas par le schéma
2. **Mass assignment** laissant une requête fixer `kind` / `role` — corrigée par les DTOs, pas par le schéma
3. **Requête mal écrite** qui omet le filtre `kind` — corrigée en **ne laissant jamais le code applicatif écrire cette requête directement**

Le découpage en deux tables n'adresse que le #3, et de manière partielle (le chemin de jointure via `accounts` peut encore fuiter si on est négligent).

## Trois architectures, compromis de sécurité explicites

### Tier 1 — Table unique `accounts` + discriminateur (le plus courant)

```
accounts (id, email, password, kind, ...)
profiles (1:1)
roles / permissions / account_roles
```

- **D'où vient la sécurité :** pattern repository, guards, DTOs
- **Risque si mal géré :** quelqu'un écrit une requête brute sans le filtre kind
- **Utilisé par :** la majorité du monde SaaS

### Tier 2 — Table unique + vue base de données (le juste milieu défensif)

```
Même schéma que le Tier 1
+ CREATE VIEW public_users AS SELECT ... FROM accounts WHERE kind = 'USER'
+ le modèle Prisma `PublicUser` mappe sur la vue
+ les contrôleurs publics ne peuvent interroger que PublicUser ;
  UsersService est la seule chose qui touche `accounts`
+ Optionnel : rôle Postgres avec SELECT uniquement sur la vue
```

- **D'où vient la sécurité :** la vue EST le filtre — il n'existe aucune requête contre `PublicUser` qui puisse retourner des admins. Même garantie qu'avec deux tables, sans dupliquer l'authentification.
- **Risque si mal géré :** très faible — un développeur devrait délibérément contourner le repository
- **Utilisé par :** les apps Postgres à forte assurance, les systèmes avec Postgres + RLS

### Tier 3 — Tables `users` et `admins` séparées (l'idée initiale)

```
accounts (login + kind)
profiles (partagé)
users   FK accounts via (accountId, kind) — la DB impose kind = 'USER'
admins  FK accounts via (accountId, kind) — la DB impose kind IN (ADMIN, SUPER_ADMIN)
```

- **D'où vient la sécurité :** séparation physique — `SELECT * FROM users` ne peut pas retourner d'admins, point final
- **Risque si mal géré :** des développeurs qui interrogent la mauvaise table ; la plomberie de login doit aller chercher dans `accounts`, pas `users` ; chaque FK inter-features doit choisir `accounts.id`
- **Utilisé par :** rare dans les SaaS modernes ; courant dans l'enterprise legacy

## Recommandation

Pour un starter NestJS qui veut **zero-trust** et **« les admins ne doivent jamais fuiter dans les listes d'utilisateurs »** comme garanties dures :

**Tier 2.** Il offre :

- Une seule table de login → un seul flux d'auth, un seul jeu de credentials, un seul endroit à durcir
- Une projection publique basée sur une vue → garantie au niveau du schéma que les endpoints publics ne peuvent pas retourner d'admins, **sans** dupliquer la plomberie d'identité
- La vue est imposée par Postgres lui-même, pas par quelqu'un qui se souvient d'ajouter `WHERE kind = 'USER'`
- Typage Prisma propre : `Account` pour le travail interne/admin, `PublicUser` pour les endpoints user-facing — TypeScript attrape les confusions
- Cron, audit logs, tables de rôles/permissions référencent toutes `accounts.id` proprement

Concrètement :

```sql
-- table accounts (source unique d'identité)
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('USER','ADMIN','SUPER_ADMIN')),
  isActive boolean NOT NULL DEFAULT true,
  isEmailVerified boolean NOT NULL DEFAULT false,
  mustChangePassword boolean NOT NULL DEFAULT false,
  ...
);

-- projection publique : une vue, pas une table
CREATE VIEW public_users AS
  SELECT a.id, a.email, a.isActive, p.firstName, p.lastName, p.avatar, a.createdAt
  FROM accounts a
  JOIN profiles p ON p.accountId = a.id
  WHERE a.kind = 'USER' AND a.isActive = true;

-- projection admins : également une vue
CREATE VIEW admin_directory AS
  SELECT a.id, a.email, a.kind, p.firstName, p.lastName, a.lastLoginAt
  FROM accounts a
  JOIN profiles p ON p.accountId = a.id
  WHERE a.kind IN ('ADMIN','SUPER_ADMIN');
```

Dans Prisma, on mappe ces vues via `view PublicUser { … }` (Prisma supporte les vues depuis la 5.0). Les contrôleurs qui consomment le listing public n'importent que `PublicUser`. Le compilateur — pas la mémoire — impose la séparation.

**Si on souhaite spécifiquement le feel routing/services « les admins vivent ailleurs »**, on l'obtient gratuitement à la couche contrôleur :

- `UsersController` → `UsersService` → `prisma.publicUser.findMany()`
- `AdminsController` → `AdminsService` → `prisma.account.findMany({ where: { kind: { in: [...] } } })`

Deux services, deux arborescences d'URL, une seule table d'identité, **sûreté au niveau du schéma sur la surface publique**.

Si vous voulez quand même le Tier 3 après cette lecture — c'est tout à fait légitime, et je peux l'implémenter proprement avec la combine de la FK composée. Mais la forme typique, moderne et bien sécurisée est le Tier 2.
