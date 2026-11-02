# ADR — 001 Découper la billetterie en Catalogue, Réservation et Paiement

**Statut :** proposé

**Date :** 2026-11-02

**Auteurs :** …

## Contexte et problème

Le monolithe concentre toutes les responsabilités dans `TicketingService` : consultation des événements, réservation, expiration et paiement. Nous devons proposer un découpage fonctionnel avant toute extraction en services.

Faits observés en utilisant l'application et l'API :

- Deux demandes simultanées peuvent obtenir la dernière place (test `test:challenge` sur `atelier-une-place`).
- Une même réservation a reçu 3 tentatives de paiement `slow` restées `PENDING`, puis une tentative `success`. Elle est `CONFIRMED` avec 4 tentatives : risque de double paiement.
- Après un `slow` suivi d'un `failure`, la réservation est `FAILED` alors qu'une tentative reste `PENDING`.
- Une réservation est acceptée sur un événement `CANCELLED`.
- Une réservation porte toujours sur 1 seule place ; un champ de quantité est ignoré sans erreur.
- N'importe qui connaissant l'identifiant peut consulter et payer une réservation.

Faits observés dans le code :

- `expirePending()` modifie la table des réservations au début de chaque méthode, y compris les lectures du catalogue.
- La disponibilité est calculée dans `EventRepository` à partir des statuts de réservation.
- `reserve()` lit la disponibilité puis crée la réservation, sans transaction ni verrou.
- `checkout()` appelle le prestataire pendant la requête, puis modifie le paiement et la réservation sans transaction ; `changeStatus()` ne vérifie pas l'état courant.

## Critères de décision

1. **Invariant de capacité** : le nombre de places retenues ne dépasse jamais la capacité.
2. **Unicité du paiement** : un visiteur ne paie jamais deux fois la même place, ni une place qu'il n'a plus.
3. **Isolation des pannes** : une panne du prestataire de paiement ne doit pas empêcher de consulter ni de réserver.
4. **Tenue à la charge** : un pic de consultation à l'ouverture des ventes ne doit pas ralentir la réservation.
5. **Évolution locale** : une nouvelle règle métier doit toucher le moins d'ensembles possible.

## Options considérées

### Option A — par responsabilité métier : Catalogue, Réservation, Paiement

- **Fonctionnement** : le Catalogue décrit les événements et leur ouverture à la vente ; la Réservation détient la capacité, les réservations et l'expiration ; le Paiement gère les tentatives et le prestataire. Le Catalogue définit la capacité et la transmet à la Réservation, qui la protège.
- **Bénéfices** : la capacité et les réservations sont décidées au même endroit ; le paiement, dépendant d'un système externe, est isolé ; le catalogue peut être mis en cache.
- **Coûts et risques** : un paiement reçu après expiration doit être réglé entre deux ensembles ; l'annulation d'un événement traverse Catalogue, Réservation et Paiement ; la disponibilité affichée est une copie qui peut avoir un léger retard.
- **Preuve** : test de concurrence ; tests de paiements multiples ; lecture de `TicketingService`.

### Option B — par parcours du visiteur : Découverte, Achat, Suivi

- **Fonctionnement** : la Découverte présente les événements ; l'Achat regroupe réservation, capacité et paiement ; le Suivi affiche une copie de l'état de la réservation.
- **Bénéfices** : la confirmation et le paiement après expiration sont décidés dans un seul ensemble ; découpage facile à expliquer.
- **Coûts et risques** : une panne du prestataire fragilise aussi la réservation ; changer de prestataire touche l'ensemble qui protège les places ; l'Achat est très gros ; le Suivi peut afficher un état en retard et pousser le visiteur à payer de nouveau.
- **Preuve** : comparaison des deux découpages face à une nouvelle règle, une panne et un pic de charge.

### Option écartée — capacité dans le Catalogue

Elle coupe l'invariant de capacité en deux ensembles : il faudrait synchroniser un compteur à chaque réservation, expiration ou échec, et le Catalogue deviendrait indispensable à chaque réservation.

## Décision et justification

Nous retenons l'**option A**.

Critère déterminant : l'**isolation des pannes et de la charge** (critères 3 et 4). Le paiement dépend d'un prestataire externe lent ou indisponible ; le séparer protège la réservation. La faiblesse de A (paiement reçu après expiration) se corrige par une règle métier explicite, alors que celle de B (panne du paiement qui bloque l'achat) est structurelle.

Compromis acceptés :

- La disponibilité affichée par le Catalogue peut avoir un léger retard ; seule la Réservation décide.
- La confirmation d'une réservation dépend d'un message du Paiement vers la Réservation.
- Une règle « paiement après expiration » doit être définie avec le métier : prolonger le délai pendant un paiement en cours, ou rembourser.

## Conséquences et vérification

Changements attendus :

- **Code** : séparer `TicketingService` en trois parties ; déplacer le calcul de disponibilité vers la Réservation ; retirer `expirePending()` des lectures du catalogue ; vérifier le statut `CANCELLED` à la réservation ; interdire un nouveau paiement tant qu'une tentative est `PENDING` ; ne confirmer qu'une réservation encore `PENDING`.
- **Données** : chaque ensemble possède ses tables ; les clés étrangères `reservations → events` et `payment_attempts → reservations` devront être remplacées par des vérifications explicites.
- **Contrats** : Réservation → Catalogue (l'événement est-il ouvert ?) ; Réservation → Paiement (demande de paiement) ; Paiement → Réservation (réussi, refusé ou inconnu).

Vérifications :

- `npm run test:challenge` doit passer : une seule réservation pour la dernière place.
- Un test doit montrer qu'un deuxième paiement est refusé tant qu'une tentative est `PENDING`.
- Un test doit montrer qu'une réservation sur un événement `CANCELLED` est refusée.
- Une mesure de charge (`docker compose --profile load run --build --rm load`) doit montrer que la consultation n'écrit plus dans la table des réservations.

À revoir si :

- le métier impose une cohérence immédiate entre paiement et réservation, plus importante que l'isolation des pannes ;
- le paiement devient interne (pas de prestataire externe) ;
- une nouvelle règle oblige régulièrement à modifier Réservation et Paiement ensemble.
