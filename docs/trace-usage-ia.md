# Trace d'usage de l'IA

Outil utilisé : Claude Code (assistant dans VS Code). Date : 2026-11-02.

| Question posée | Proposition de l'IA | Décision de l'équipe | Vérification réalisée |
| --- | --- | --- | --- |
| Faut-il installer des packages ? | Non, Docker installe les dépendances via le Dockerfile (`npm ci`). | Lancement avec `docker compose up --build -d`. | Application accessible sur http://localhost:3000, `/health` répond `ok`. |
| Que faire au début du TP ? | Suivre les 6 étapes de `docs/ateliers/decoupage-fonctionnel.md`, sans ouvrir `src/` au départ. | Méthode suivie. | Lecture du README et de la méthode. |
| Quel est le parcours du visiteur ? | Tester réservation et paiements `success`, `failure`, `slow` via l'API. | Parcours retenu comme base de l'enquête. | Requêtes `curl` sur l'API et parcours dans l'interface. |
| Quels sont les objets métier et leurs relations ? | Événement, Réservation, Tentative de paiement, Disponibilité (calculée), Visiteur (simple référence) ; diagrammes PlantUML. | … (à compléter : objets gardés, modifiés ou ajoutés) | Diagrammes affichés dans PlantUML ; confrontés aux réponses de l'API. |
| Peut-on réserver 2 places ? | Tester un champ de quantité. | Une réservation = 1 place. | Requêtes avec `quantity`, `seats`, `places` : 1 place retenue à chaque fois ; lecture de `src/app.ts`. |
| À quoi sert le statut de l'événement ? | Tester une réservation sur un événement annulé. | Règle « pas de réservation sur un événement annulé » ajoutée aux incertitudes. | Événement passé en `CANCELLED` en base : réservation acceptée ; statut remis à `OPEN`. |
| Une réservation peut-elle avoir plusieurs paiements ? | Enchaîner plusieurs paiements sur une même réservation. | Risque de double paiement retenu comme point critique. | 3 `slow` puis `success` : réservation `CONFIRMED` avec 4 tentatives, dont 3 `PENDING`. |
| Quelles questions poser au métier ? | 35 questions classées par invariant, 5 prioritaires. | … (à compléter : questions retenues) | Questions reliées aux tests ci-dessus. |
| Quel premier découpage ? | Découpage A : Catalogue, Réservation, Paiement ; capacité dans Réservation. | Découpage A retenu comme proposition. | Raisonnement sur la concurrence ; test `test:challenge`. |
| Quel deuxième découpage ? | Découpage B par parcours : Découverte, Achat, Suivi. | Idée choisie par l'équipe parmi deux propositions. | Comparaison écrite avec A. |
| Comment comparer A et B ? | Tableau : nouvelle règle, panne, pic de charge, paiement après expiration. | Découpage A retenu (isolation des pannes et de la charge). | … (à compléter : mesure de charge ou test si réalisé) |
| Où les responsabilités sont-elles mélangées dans le code ? | Analyse de `TicketingService`, des repositories et du schéma SQL. | Constats repris dans l'ADR 001. | Lecture du code avec numéros de ligne. |
| TP 2 : comment refuser un événement annulé ? | Écrire d'abord un test, puis ajouter une condition dans `TicketingService.reserve()` avec `409 EVENT_CANCELLED` ; ajouter `concert-annule` aux données. | … (à compléter : code d'erreur et couche retenus) | Test en échec avant (201 au lieu de 409), 8/8 tests verts après ; vérification avec `curl` sur l'application lancée. |
| TP 2 : quelle dérive du N-Layer ? | Le service lève des codes HTTP (`AppError(409, ...)`) ; règles dans le SQL ; lectures qui écrivent. | … (à compléter) | Lecture de `TicketingService.ts`, `EventRepository.ts`, `ReservationRepository.ts`. |

## Ce que l'équipe a vérifié elle-même

… (à compléter : ce que vous avez relu, testé ou contesté)

## Limites

Les propositions de l'IA ont été vérifiées par des requêtes sur l'API et la lecture du code. Les règles métier (par exemple le paiement reçu après expiration) restent des hypothèses à confirmer avec le métier.
