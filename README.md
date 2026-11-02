# Billetterie — socle du cours d'architecture

Une billetterie fictive, exécutable dès le départ, pour étudier les choix d'architecture à partir d'un cas métier. Le dépôt fournit **un monolithe TypeScript/Node.js en couches**, une interface web, PostgreSQL et un paiement simulé. Les frontières métier et les solutions des ateliers sont à construire et à défendre par les étudiants.

## Démarrer

Prérequis : Docker Desktop ou Docker Engine avec Compose. Aucun compte de paiement ni installation locale de Node.js n'est nécessaire.

```sh
docker compose up --build -d
```

Ouvrir [http://localhost:3000](http://localhost:3000). Pour suivre le démarrage :

```sh
docker compose ps
docker compose logs -f app
```

L'application démarre avec trois événements fictifs, dont un événement d'une seule place pour les expériences de concurrence. Les données sont conservées dans un volume Docker entre deux démarrages.

## Parcours de démonstration

1. Choisir un événement et saisir un identifiant visiteur **fictif**.
2. Réserver une place. La réservation est `PENDING` et retient la place pendant 15 minutes par défaut.
3. Déclencher le paiement simulé : `success` confirme, `failure` refuse et libère la place, `slow` laisse le résultat en attente.
4. Copier l'identifiant de réservation et consulter son état dans le panneau de suivi.

Le scénario `slow` attend 2 secondes par défaut. Il ne contacte aucun prestataire et ne débite personne. Une réservation en attente expirée libère sa place lors d'une prochaine requête. Les états et leurs limites sont décrits dans [l'architecture initiale](docs/architecture-initiale.md).

## Commandes d'atelier

| Action | Commande |
| --- | --- |
| Lancer les tests ordinaires dans un conteneur | `docker compose --profile test run --build --rm test` |
| Observer le défaut de concurrence initial | `docker compose --profile test run --rm test sh -c 'node dist/migrate.js && npm run test:challenge'` |
| Mesurer la consultation pendant 10 secondes | `docker compose --profile load run --build --rm load` |
| Arrêter les conteneurs en gardant les données | `docker compose down` |
| Réinitialiser la démonstration locale | `docker compose --profile test down -v` puis `docker compose up --build -d` |

Le **test de concurrence échoue volontairement dans la version initiale**. Il crée deux demandes simultanées pour une seule place ; il devient un test de régression une fois la garantie implémentée. Ne le lancez pas sur la base principale : il utilise `db-test`, une base séparée. Les tests ordinaires réinitialisent également cette base de test avant chaque scénario.

Pour modifier la durée ou la pression de charge, définir les variables `LOAD_SECONDS`, `LOAD_CONCURRENCY` ou `EVENT_ID` avant la commande Compose. Les résultats donnent le nombre de requêtes, les erreurs, le débit et les latences p50/p95. Les chiffres dépendent de la machine locale et sont destinés à comparer deux versions dans des conditions similaires.

## API

| Méthode et route | Usage |
| --- | --- |
| `GET /api/events` | Liste et places affichées |
| `GET /api/events/:id` | Détail d'un événement |
| `POST /api/reservations` | Réserver une place avec `{ "eventId": "festival-lumieres", "customerRef": "demo-1" }` |
| `GET /api/reservations/:id` | État et tentatives de paiement |
| `POST /api/reservations/:id/checkout` | Paiement fictif avec `{ "scenario": "success" }`, `failure` ou `slow` |
| `GET /health` | Santé de l'application et accès à la base |

Les erreurs JSON ont la forme `{ "error": { "code": "…", "message": "…" } }`. La réservation peut renvoyer `400` (entrée invalide), `404` (événement absent) ou `409` (plus de place `SOLD_OUT`, ou événement annulé `EVENT_CANCELLED`). Le checkout peut également renvoyer `410` (réservation expirée). Une erreur technique retourne `503`.

## Progression pédagogique

Commencer par découvrir les objets et parcours métier **avant** d'utiliser les dossiers du code comme modèle de découpage. Puis faire évoluer le monolithe par étapes : N-Layer, Clean Architecture, CQRS et vertical slices. Comparer ensuite plusieurs découpages fonctionnels, décider et justifier une extraction en **trois services**, puis travailler les problèmes de concurrence, transactions, pannes et scalabilité. Cette suite sert à faire apparaître de nouvelles contraintes ; aucun style n'est présenté comme supérieur en toute situation.

La [méthode de découpage](docs/ateliers/decoupage-fonctionnel.md) guide l'enquête sans nommer les services attendus. Le [modèle d'ADR](docs/adr-template.md) et les [règles d'usage de l'IA](docs/usage-ia.md) accompagnent la justification des décisions.

## Structure initiale

```text
public/             interface de démonstration
src/app.ts          routes HTTP
src/services/       décisions et orchestration métier
src/repositories/   accès PostgreSQL
src/integrations/   paiement fictif
db/                 schéma et données de démonstration
tests/              parcours ordinaires et défi séparé
scripts/            mesure de charge simple
```

Le code de départ concentre volontairement plusieurs responsabilités dans `TicketingService`. Certaines garanties restent à construire. Lire [les limites connues](docs/architecture-initiale.md) avant de modifier le système.
