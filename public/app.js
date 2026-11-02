const eventsElement = document.querySelector('#events');
const feedback = document.querySelector('#feedback');
const stateElement = document.querySelector('#reservation-state');
const controls = document.querySelector('#checkout-controls');
const checkoutButton = document.querySelector('#checkout');
const loginForm = document.querySelector('#login-form');
const accountInfo = document.querySelector('#account-info');
let currentReservationId = null;
let currentUser = null;

// Le cookie de session est envoyé automatiquement par le navigateur (même origine).
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'La demande n’a pas abouti.');
    error.code = body?.error?.code;
    if (error.code === 'AUTH_REQUIRED' && path !== '/api/auth/me') setUser(null);
    throw error;
  }
  return body;
}

function showFeedback(message = '') { feedback.textContent = message; }

function resetReservation(message) {
  currentReservationId = null;
  document.querySelector('#lookup-id').value = '';
  stateElement.textContent = message;
  controls.hidden = true;
}

// Affichage seulement : la protection réelle est faite par l'API.
function setUser(user) {
  currentUser = user;
  loginForm.hidden = Boolean(user);
  accountInfo.hidden = !user;
  document.querySelector('#account-name').textContent = user ? user.login : '';
  if (!user) resetReservation('Connectez-vous pour commencer l’achat.');
  else if (!currentReservationId) resetReservation('Choisissez un événement pour commencer.');
  loadEvents();
}

function displayReservation(reservation) {
  currentReservationId = reservation.id;
  document.querySelector('#lookup-id').value = reservation.id;
  const labels = {
    PENDING: 'En attente de paiement',
    CONFIRMED: 'Achat confirmé',
    FAILED: 'Paiement refusé',
    EXPIRED: 'Réservation expirée',
  };
  stateElement.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = labels[reservation.status] || reservation.status;
  const id = document.createElement('span');
  id.className = 'reservation-id';
  id.textContent = `Référence : ${reservation.id}`;
  const detail = document.createElement('span');
  detail.textContent = reservation.status === 'PENDING'
    ? 'La place est retenue provisoirement. Une réponse lente ne confirme pas l’achat.'
    : reservation.status === 'CONFIRMED'
      ? 'Votre place est confirmée.'
      : 'Cette réservation ne retient plus de place.';
  stateElement.append(title, id, detail);
  controls.hidden = reservation.status !== 'PENDING';
}

async function loadEvents() {
  try {
    const { events } = await api('/api/events');
    eventsElement.replaceChildren();
    for (const event of events) {
      const card = document.createElement('article');
      card.className = 'event-card';
      const info = document.createElement('div');
      const date = document.createElement('p');
      date.className = 'event-date';
      date.textContent = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(event.startsAt));
      const title = document.createElement('h3');
      title.textContent = event.title;
      const venue = document.createElement('p');
      venue.className = 'event-place';
      venue.textContent = event.venue;
      const availability = document.createElement('p');
      availability.className = 'availability';
      availability.textContent = event.available > 0 ? `${event.available} place${event.available > 1 ? 's' : ''} affichée${event.available > 1 ? 's' : ''}` : 'Complet';
      info.append(date, title, venue, availability);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = currentUser ? 'Réserver' : 'Connexion requise';
      button.disabled = event.available <= 0 || !currentUser;
      button.addEventListener('click', () => reserve(event.id, button));
      card.append(info, button);
      eventsElement.append(card);
    }
  } catch (error) {
    eventsElement.textContent = 'Impossible de charger les événements.';
    showFeedback(error.message);
  }
}

async function reserve(eventId, button) {
  showFeedback();
  button.disabled = true;
  try {
    const { reservation } = await api('/api/reservations', {
      method: 'POST', body: JSON.stringify({ eventId }),
    });
    displayReservation(reservation);
    await loadEvents();
  } catch (error) {
    showFeedback(error.message);
    button.disabled = !currentUser;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  showFeedback();
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: document.querySelector('#login').value.trim(),
        password: document.querySelector('#password').value,
      }),
    });
    document.querySelector('#password').value = '';
    setUser(user);
  } catch (error) { showFeedback(error.message); }
});

document.querySelector('#logout').addEventListener('click', async () => {
  showFeedback();
  try { await api('/api/auth/logout', { method: 'POST' }); }
  finally { setUser(null); }
});

checkoutButton.addEventListener('click', async () => {
  if (!currentReservationId) return;
  checkoutButton.disabled = true;
  showFeedback();
  try {
    const scenario = document.querySelector('#scenario').value;
    const { reservation, paymentAttempt } = await api(`/api/reservations/${currentReservationId}/checkout`, {
      method: 'POST', body: JSON.stringify({ scenario }),
    });
    displayReservation(reservation);
    if (paymentAttempt.status === 'PENDING') showFeedback('Résultat du paiement inconnu : consultez de nouveau l’état avant de conclure.');
    await loadEvents();
  } catch (error) { showFeedback(error.message); }
  finally { checkoutButton.disabled = false; }
});

document.querySelector('#lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  showFeedback();
  const id = document.querySelector('#lookup-id').value.trim();
  if (!id) { showFeedback('Saisissez une référence de réservation.'); return; }
  try {
    const { reservation } = await api(`/api/reservations/${encodeURIComponent(id)}`);
    displayReservation(reservation);
    await loadEvents();
  } catch (error) { showFeedback(error.message); }
});

document.querySelector('#refresh-events').addEventListener('click', loadEvents);
api('/api/auth/me').then(({ user }) => setUser(user)).catch(() => setUser(null));
