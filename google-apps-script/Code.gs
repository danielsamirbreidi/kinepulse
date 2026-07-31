/*==================================================
KINÉPULSE — BACKEND DE RÉSERVATION
Google Apps Script

Ce script fait :
1. Expose la liste des créneaux de massage réellement libres
   (calculés depuis ton horaire fixe, moins ce qui est déjà
   pris dans Google Calendar)
2. Quand un massage est réservé: crée l'événement dans Google
   Calendar + une fiche dans Notion (Rendez-Vous) + une fiche
   Facture liée (statut "En attente", prête pour ton clic
   "Payée") + envoie une confirmation immédiate au client
3. Quand une demande EMS est envoyée: crée seulement une fiche
   dans Notion (Leads EMS, PAS de rendez-vous) + envoie un
   message "on vous contactera" au client
4. Chaque jour (automatique, via déclencheur) :
   - envoie un rappel de rendez-vous aux clients qui ont un
     massage le lendemain
   - t'envoie un résumé des forfaits EMS qui arrivent à
     renouvellement dans les 5 prochains jours

==================================================
CONFIGURATION REQUISE (Extensions > Propriétés du script)
==================================================
NOTION_TOKEN       -> ton "Internal Integration Secret" (ntn_...)
OWNER_EMAIL        -> ton adresse courriel (pour les notifications)
CLINIC_ADDRESS     -> adresse de la clinique (pour les courriels)
==================================================
APRÈS LE DÉPLOIEMENT — À FAIRE UNE SEULE FOIS
==================================================
Dans l'éditeur Apps Script, sélectionne la fonction
"setupDailyTrigger" dans le menu déroulant en haut, puis
clique ▶ Exécuter. Ça active les rappels et alertes
automatiques quotidiens (8h00 chaque matin).
==================================================
*/

const NOTION_VERSION = '2025-09-03';
const TIMEZONE = 'America/Toronto';

// IDs des "data sources" Notion (obtenus via l'intégration KinéPulse Site)
const DS_RENDEZVOUS   = '3aa36ea7-3613-8049-82d0-000b6ac93dea';
const DS_CLIENTS      = '39936ea7-3613-8005-86b9-000b8195be50';
const DS_LEADS_EMS    = 'bb23ddce-e51d-487e-9eb5-4c20590d5889';
const DS_FACTURES     = '3aa36ea7-3613-8072-98d9-000b5113c510';
const DS_EMS_MEMBERSHIP = '3aa36ea7-3613-8009-844c-000b3b0dc38d';
const DS_FICHE_SANTE  = '11599f8a-972b-427b-ad0a-0c5a04e6d734';
const DS_DEPENSES     = '3aa36ea7-3613-8021-af97-000bb7200726';
const DS_KPI_MENSUEL  = '85be855d-6f86-4387-b584-069bba9bab8b';
const DS_SERVICES     = '39936ea7-3613-80e1-935f-000b367127f7';

// IDs des fiches Service (Massage 60/90 min) dans la base Services
const SERVICE_MASSAGE_60 = '39936ea7-3613-81c4-99d1-e397542b5cd7';
const SERVICE_MASSAGE_90 = '3ab36ea7-3613-80a0-aee0-d84d646d8f84';

// Horaire fixe des créneaux de massage (heures locales, format 24h)
const MASSAGE_SLOTS = {
  1: ['16:00', '17:15'], // Lundi
  2: ['16:00', '17:15'], // Mardi
  3: ['16:00', '17:15'], // Mercredi
  4: ['16:00', '17:15'], // Jeudi
  5: ['16:00', '17:15'], // Vendredi
  6: ['09:00', '10:15', '11:30', '12:45'], // Samedi
  0: [] // Dimanche fermé
};

const BOOKING_WINDOW_DAYS = 60; // combien de jours à l'avance on ouvre la réservation (~2 mois)
const EMS_RENEWAL_ALERT_DAYS = 5; // combien de jours avant renouvellement on t'alerte
const EXPENSE_ALERT_DAYS = 7; // combien de jours avant une depense recurrente on t'alerte

const EMAIL_SIGNATURE =
  '\n\n—\n' +
  'Clinique KinéPulse\n' +
  '13301 Rue Sherbrooke E, bureau 216, Montréal, QC H1A 1C2\n' +
  '(263) 378-2247 · info@kinepulse.ca';

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDateFr(day) {
  const jour = JOURS_FR[day.getDay()];
  const mois = MOIS_FR[day.getMonth()];
  return jour + ' ' + day.getDate() + ' ' + mois;
}

/*==================================================
POINT D'ENTRÉE - GET (liste des créneaux disponibles)
==================================================*/

function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'slots') {
      const duration = parseInt(e.parameter.duration || '60', 10);
      const slots = getAvailableSlots(duration);
      return jsonResponse({ success: true, slots: slots });
    }

    return jsonResponse({ success: false, error: 'Action inconnue' });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

/*==================================================
POINT D'ENTRÉE - POST (réservation massage / demande EMS)
==================================================*/

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.type === 'massage') {
      return jsonResponse(handleMassageBooking(data));
    }

    if (data.type === 'ems') {
      return jsonResponse(handleEmsLead(data));
    }

    if (data.type === 'intake') {
      return jsonResponse(handleHealthIntake(data));
    }

    if (data.type === 'contact') {
      return jsonResponse(handleContactMessage(data));
    }

    return jsonResponse({ success: false, error: 'Type de demande inconnu' });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

/*==================================================
CRÉNEAUX DISPONIBLES
==================================================*/

function getAvailableSlots(durationMinutes) {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const slots = [];

  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BOOKING_WINDOW_DAYS);

  // Un seul appel au calendrier pour toute la fenêtre (beaucoup plus rapide
  // que de vérifier chaque créneau individuellement)
  const events = calendar.getEvents(windowStart, windowEnd);

  for (let d = 0; d < BOOKING_WINDOW_DAYS; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const dayOfWeek = day.getDay();
    const times = MASSAGE_SLOTS[dayOfWeek] || [];

    times.forEach(function (timeStr) {
      const startDate = buildDateTime(day, timeStr);

      // On ignore les créneaux déjà passés aujourd'hui
      if (startDate <= now) return;

      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

      const hasConflict = events.some(function (ev) {
        return ev.getStartTime() < endDate && ev.getEndTime() > startDate;
      });

      if (!hasConflict) {
        slots.push({
          date: Utilities.formatDate(day, TIMEZONE, 'yyyy-MM-dd'),
          time: timeStr,
          label: formatDateFr(day) + ' — ' + timeStr
        });
      }
    });
  }

  return slots;
}

function buildDateTime(day, timeStr) {
  const parts = timeStr.split(':');
  const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
                       parseInt(parts[0], 10), parseInt(parts[1], 10));
  return dt;
}

/*==================================================
RÉSERVATION MASSAGE
==================================================*/

function handleMassageBooking(data) {
  const nom = (data.nom || '').trim();
  const telephone = (data.telephone || '').trim();
  const email = (data.email || '').trim();
  const duration = data.duration === '90 minutes' ? 90 : 60;
  const dateStr = data.date;   // "2026-08-03"
  const timeStr = data.time;   // "16:00"
  const disponibilites = data.disponibilites || [];

  if (!nom || !telephone || !email || !dateStr || !timeStr) {
    return { success: false, error: 'Champs manquants' };
  }

  const dayParts = dateStr.split('-').map(Number);
  const day = new Date(dayParts[0], dayParts[1] - 1, dayParts[2]);
  const startDate = buildDateTime(day, timeStr);
  const endDate = new Date(startDate.getTime() + duration * 60000);

  // 1. Revérifie que le créneau est toujours libre (évite le double-booking)
  const calendar = CalendarApp.getDefaultCalendar();
  const conflicts = calendar.getEvents(startDate, endDate);
  if (conflicts.length > 0) {
    return { success: false, error: 'SLOT_TAKEN' };
  }

  // 2. Crée l'événement Google Calendar
  const event = calendar.createEvent(
    'Massage ' + duration + ' min — ' + nom,
    startDate,
    endDate,
    {
      description: 'Téléphone: ' + telephone + '\nCourriel: ' + email +
                    '\nDisponibilités indiquées: ' + disponibilites.join(', '),
      location: getOwnerProperty('CLINIC_ADDRESS', '')
    }
  );

  // 3. Trouve ou crée le client dans Notion (met aussi à jour "Dernière visite")
  const client = findOrCreateClient(nom, telephone, email, 'Massage', dateStr);
  const clientId = client.id;

  // 4. Crée la fiche Rendez-Vous dans Notion
  const serviceId = duration === 90 ? SERVICE_MASSAGE_90 : SERVICE_MASSAGE_60;
  const rdv = createNotionPage(DS_RENDEZVOUS, {
    'Rendez-vous': titleProp('Massage ' + duration + ' min — ' + nom),
    'Date': dateProp(dateStr),
    'Heure': richTextProp(timeStr),
    'Client': relationProp([clientId]),
    'Service': relationProp([serviceId]),
    'Thérapeute': selectProp('Daniel'),
    'Statut': selectProp('Confirmé')
  });

  // Note: la facture n'est PAS créée automatiquement ici — Daniel préfère
  // cliquer lui-même le bouton "Créer facture" sur la fiche Rendez-Vous
  // au moment où le client paie réellement.

  // 5. Confirmation au client (le lien de la fiche santé n'est envoyé
  // qu'aux NOUVEAUX clients — un client existant l'a déjà remplie)
  const dateLisible = formatDateFr(day) + ' ' + day.getFullYear();
  MailApp.sendEmail({
    to: email,
    subject: 'Confirmation de votre rendez-vous — Clinique KinéPulse',
    body:
      'Bonjour ' + nom + ',\n\n' +
      'Votre rendez-vous est confirmé :\n\n' +
      'Massage thérapeutique ' + duration + ' minutes\n' +
      'Date : ' + dateLisible + '\n' +
      'Heure : ' + timeStr + '\n\n' +
      (getOwnerProperty('CLINIC_ADDRESS', '') ? 'Adresse : ' + getOwnerProperty('CLINIC_ADDRESS', '') + '\n\n' : '') +
      (!clientAlreadyHasHealthForm(telephone, clientId)
        ? 'Pour sauver du temps sur place, prenez 3 minutes pour remplir votre fiche santé avant votre visite :\n' +
          'https://kinepulse.ca/pages/fiche-sante.html\n\n'
        : '') +
      'Au plaisir de vous accueillir.' +
      EMAIL_SIGNATURE
  });

  // 6. Notification au propriétaire
  notifyOwner(
    'Nouveau massage réservé — ' + nom,
    nom + ' a réservé un massage ' + duration + ' min le ' + dateLisible + ' à ' + timeStr +
    '.\nTéléphone: ' + telephone + '\nCourriel: ' + email
  );

  return { success: true, event: event.getId() };
}

/*==================================================
DEMANDE EMS (liste de suivi, pas de rendez-vous)
==================================================*/

function handleEmsLead(data) {
  const nom = (data.nom || '').trim();
  const telephone = (data.telephone || '').trim();
  const email = (data.email || '').trim();
  const objectif = (data.objectif || 'Autre').trim();
  const disponibilites = data.disponibilites || [];

  if (!nom || !telephone || !email) {
    return { success: false, error: 'Champs manquants' };
  }

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  createNotionPage(DS_LEADS_EMS, {
    'Nom': titleProp(nom),
    'Téléphone': phoneProp(telephone),
    'Courriel': emailProp(email),
    'Objectif': selectProp(objectif),
    'Disponibilités': richTextProp(disponibilites.join(', ')),
    'Date de la demande': dateProp(today),
    'Statut': selectProp('À contacter')
  });

  // N'envoie le lien de la fiche santé que si ce client n'en a pas déjà une
  // (ex: il a déjà réservé un massage avant)
  const needsHealthForm = !clientAlreadyHasHealthForm(telephone);

  MailApp.sendEmail({
    to: email,
    subject: 'Votre demande de consultation EMS — Clinique KinéPulse',
    body:
      'Bonjour ' + nom + ',\n\n' +
      'Merci pour votre demande de consultation EMS.\n' +
      'Nous avons bien reçu vos informations et nous vous contacterons ' +
      'sous peu afin de planifier votre séance.\n\n' +
      (needsHealthForm
        ? 'Pour sauver du temps, vous pouvez déjà remplir votre fiche santé :\n' +
          'https://kinepulse.ca/pages/fiche-sante.html\n\n'
        : '') +
      'Au plaisir de vous accompagner.' +
      EMAIL_SIGNATURE
  });

  notifyOwner(
    'Nouveau lead EMS — ' + nom,
    nom + ' a demandé une consultation EMS (objectif: ' + objectif + ').\n' +
    'Téléphone: ' + telephone + '\nCourriel: ' + email +
    '\nDisponibilités: ' + disponibilites.join(', ') +
    '\n\n-> À ajouter à Notion "Leads EMS", statut "À contacter".'
  );

  return { success: true };
}

/*==================================================
AUTOMATISATION QUOTIDIENNE
(rappels de rendez-vous + alertes renouvellement EMS)
==================================================*/

function dailyAutomation() {
  sendAppointmentReminders();
  checkEmsRenewals();
  checkUpcomingExpenses();
  computeMonthlyKPIs();
}

function setupDailyTrigger() {
  // Supprime d'anciens déclencheurs pour éviter les doublons
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyAutomation') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('dailyAutomation')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone(TIMEZONE)
    .create();
}

function setupCalendarSyncTrigger() {
  // Supprime d'anciens déclencheurs pour éviter les doublons
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncCalendarToNotion') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('syncCalendarToNotion')
    .timeBased()
    .everyMinutes(10)
    .create();
}

function setupExpenseEmailTrigger() {
  // Supprime d'anciens déclencheurs pour éviter les doublons
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processExpenseEmails') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('processExpenseEmails')
    .timeBased()
    .everyMinutes(15)
    .create();
}

/*==================================================
SYNCHRONISATION CALENDAR -> NOTION
(pour les rendez-vous ajoutés manuellement dans Google
Calendar, hors du site — copie vers Notion "Rendez-Vous"
s'ils n'y sont pas déjà)
==================================================*/

/*==================================================
DÉPENSES PAR COURRIEL (photo/PDF de facture -> lu par
l'IA Gemini -> ligne créée automatiquement dans Notion)
==================================================*/

const EXPENSE_CATEGORY_MAP = {
  'Maintenance': '🔧 Maintenance',
  'Fournitures': '📦 Fournitures',
  'Équipement EMS': '🏋️ Équipement EMS',
  'Salaires': '👨‍⚕️ Salaires',
  'Logiciels': '💻 Logiciels',
  'Loyer': '🏢 Loyer',
  'Assurance': '🛡 Assurance',
  'Électricité': '⚡ Électricité',
  'Marketing': '📢 Marketing',
  'Autre': '📌 Autre'
};

function processExpenseEmails() {
  const geminiKey = getOwnerProperty('GEMINI_API_KEY', '');
  if (!geminiKey) {
    Logger.log('GEMINI_API_KEY manquante — arrêt.');
    return;
  }

  const threads = GmailApp.search('subject:depense has:attachment is:unread', 0, 20);
  Logger.log('Fils trouvés à traiter : ' + threads.length);
  if (threads.length === 0) return;

  threads.forEach(function (thread) {
    const messages = thread.getMessages();

    messages.forEach(function (message) {
      if (!message.isUnread()) return;

      Logger.log('Traitement du courriel : "' + message.getSubject() + '"');

      const attachments = message.getAttachments();
      Logger.log('Pièces jointes trouvées : ' + attachments.length);
      if (attachments.length === 0) {
        message.markRead();
        return;
      }

      try {
        const attachment = attachments[0]; // la première pièce jointe
        Logger.log('Envoi à Gemini : ' + attachment.getName() + ' (' + attachment.getContentType() + ')');
        const extracted = extractExpenseWithGemini(attachment, geminiKey);
        Logger.log('Réponse Gemini : ' + JSON.stringify(extracted));

        if (!extracted) {
          throw new Error('Aucune donnée extraite par Gemini');
        }

        const categorieLabel = EXPENSE_CATEGORY_MAP[extracted.categorie] || '📌 Autre';
        const dateStr = extracted.date || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

        createNotionPage(DS_DEPENSES, {
          'Fournisseur': titleProp(extracted.fournisseur || 'Fournisseur inconnu'),
          'Montant avant taxes': numberProp(extracted.montant_avant_taxes || 0),
          'TPS': numberProp(extracted.tps || 0),
          'TVQ': numberProp(extracted.tvq || 0),
          'Date': dateProp(dateStr),
          'Catégorie': selectProp(categorieLabel),
          'Statut paiement': selectProp('🟡 En attente'),
          'Description': richTextProp('Ajouté automatiquement par courriel (' + attachment.getName() + ') — à vérifier')
        });

        Logger.log('Fiche Dépenses créée dans Notion avec succès.');

        notifyOwner(
          '✅ Dépense ajoutée automatiquement — ' + (extracted.fournisseur || '?'),
          'Une nouvelle dépense a été extraite automatiquement et ajoutée à Notion :\n\n' +
          'Fournisseur : ' + (extracted.fournisseur || '?') + '\n' +
          'Montant avant taxes : ' + (extracted.montant_avant_taxes || '?') + ' $\n' +
          'TPS : ' + (extracted.tps || 0) + ' $\n' +
          'TVQ : ' + (extracted.tvq || 0) + ' $\n' +
          'Date : ' + dateStr + '\n' +
          'Catégorie : ' + categorieLabel + '\n\n' +
          '⚠️ Vérifie ces montants dans Notion, l\'extraction automatique peut se tromper.'
        );

        message.markRead();

      } catch (err) {
        Logger.log('ERREUR : ' + err.message);
        notifyOwner(
          '⚠️ Échec extraction dépense automatique',
          'Un courriel avec le sujet "' + message.getSubject() + '" (reçu de ' + message.getFrom() + ') n\'a pas pu être traité automatiquement.\n\n' +
          'Erreur : ' + err.message + '\n\n' +
          'Ajoute cette dépense manuellement dans Notion.'
        );
        message.markRead();
      }
    });
  });
}

function extractExpenseWithGemini(attachment, apiKey) {
  const base64Data = Utilities.base64Encode(attachment.getBytes());
  const mimeType = attachment.getContentType();

  const prompt =
    'Analyse cette facture ou ce reçu de dépense et extrait les informations suivantes. ' +
    'Réponds uniquement avec un objet JSON, rien d\'autre. ' +
    'Format exact attendu : ' +
    '{"fournisseur": "nom du commerce/fournisseur", ' +
    '"montant_avant_taxes": nombre (avant TPS/TVQ), ' +
    '"tps": nombre, ' +
    '"tvq": nombre, ' +
    '"date": "YYYY-MM-DD", ' +
    '"categorie": "une seule valeur parmi Maintenance, Fournitures, Équipement EMS, Salaires, Logiciels, Loyer, Assurance, Électricité, Marketing, Autre"}. ' +
    'Si les taxes ne sont pas détaillées séparément mais qu\'un total est visible, ' +
    'calcule TPS = total × 5 ÷ 114.975 et TVQ = total × 9.975 ÷ 114.975 (taxes du Québec, Canada). ' +
    'Si une information est manquante ou illisible, utilise 0 pour les nombres ou une estimation raisonnable pour la catégorie.';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  if (res.getResponseCode() >= 300) {
    throw new Error('Erreur Gemini: ' + res.getContentText());
  }

  const body = JSON.parse(res.getContentText());
  const textResult = body.candidates && body.candidates[0] && body.candidates[0].content &&
                      body.candidates[0].content.parts && body.candidates[0].content.parts[0] &&
                      body.candidates[0].content.parts[0].text;

  if (!textResult) {
    throw new Error('Réponse Gemini vide ou inattendue');
  }

  return JSON.parse(textResult);
}

function syncCalendarToNotion() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60000); // 60 jours

  const events = calendar.getEvents(now, windowEnd);
  if (events.length === 0) return;

  // Récupère les rendez-vous déjà connus dans Notion (à venir) pour éviter les doublons
  const today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const result = queryNotionDataSource(DS_RENDEZVOUS, {
    filter: { property: 'Date', date: { on_or_after: today } }
  });

  const known = {};
  (result.results || []).forEach(function (rdv) {
    const d = rdv.properties['Date'] && rdv.properties['Date'].date;
    const h = getPlainText(rdv.properties['Heure']);
    if (d && d.start) {
      known[d.start + '|' + h] = true;
    }
  });

  events.forEach(function (ev) {
    const title = ev.getTitle() || '';

    // Ne synchronise que les événements qui mentionnent "massage" (insensible à la casse)
    if (title.toLowerCase().indexOf('massage') === -1) return;

    const evDate = Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'yyyy-MM-dd');
    const evTime = Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'HH:mm');
    const key = evDate + '|' + evTime;

    if (known[key]) return; // déjà dans Notion (probablement créé par le site)

    try {
      const props = {
        'Rendez-vous': titleProp('📅 ' + ev.getTitle()),
        'Date': dateProp(evDate),
        'Heure': richTextProp(evTime),
        'Thérapeute': selectProp('Daniel'),
        'Statut': selectProp('Confirmé'),
        'Service': relationProp([title.indexOf('90') !== -1 ? SERVICE_MASSAGE_90 : SERVICE_MASSAGE_60])
      };

      // Essaie de retrouver un client existant dont le nom apparaît dans le titre
      const matchedClientId = findClientByNameInText(title);
      if (matchedClientId) {
        props['Client'] = relationProp([matchedClientId]);
      }

      createNotionPage(DS_RENDEZVOUS, props);
      known[key] = true;
    } catch (syncErr) {
      // On ignore silencieusement (ex: événement personnel sans lien avec la clinique)
    }
  });
}

function findClientByNameInText(text) {
  const lowerText = text.toLowerCase();
  const allClients = queryNotionDataSource(DS_CLIENTS, {});

  let match = null;
  (allClients.results || []).forEach(function (client) {
    if (match) return;
    const nom = getTitleText(client.properties['Nom complet']);
    if (!nom) return;
    const parts = nom.toLowerCase().split(' ').filter(function (p) { return p.length > 2; });
    const found = parts.some(function (p) { return lowerText.indexOf(p) !== -1; });
    if (found) match = client.id;
  });

  return match;
}

function sendAppointmentReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, TIMEZONE, 'yyyy-MM-dd');

  const result = queryNotionDataSource(DS_RENDEZVOUS, {
    filter: {
      and: [
        { property: 'Date', date: { equals: tomorrowStr } },
        { property: 'Statut', select: { equals: 'Confirmé' } }
      ]
    }
  });

  const appointments = result.results || [];

  appointments.forEach(function (rdv) {
    try {
      const heure = getPlainText(rdv.properties['Heure']);
      const clientRelation = rdv.properties['Client'] && rdv.properties['Client'].relation;

      if (!clientRelation || clientRelation.length === 0) return;

      const client = getNotionPage(clientRelation[0].id);
      const email = client.properties['Email'] && client.properties['Email'].email;
      const nom = getTitleText(client.properties['Nom complet']);

      if (!email) return;

      MailApp.sendEmail({
        to: email,
        subject: 'Rappel — votre rendez-vous demain chez KinéPulse',
        body:
          'Bonjour ' + nom + ',\n\n' +
          'Petit rappel : vous avez un rendez-vous demain à ' + heure + '.\n\n' +
          (getOwnerProperty('CLINIC_ADDRESS', '') ? 'Adresse : ' + getOwnerProperty('CLINIC_ADDRESS', '') + '\n\n' : '') +
          'Au plaisir de vous accueillir.' +
          EMAIL_SIGNATURE
      });

    } catch (err) {
      notifyOwner('Erreur rappel rendez-vous', err.message);
    }
  });
}

function checkEmsRenewals() {
  const result = queryNotionDataSource(DS_EMS_MEMBERSHIP, {
    filter: { property: 'Statut', select: { equals: '🟢 Actif' } }
  });

  const memberships = result.results || [];
  const today = new Date();
  const alertLimit = new Date();
  alertLimit.setDate(today.getDate() + EMS_RENEWAL_ALERT_DAYS);

  const upcoming = [];

  memberships.forEach(function (m) {
    const dateProp = m.properties['Date renouvellement'] && m.properties['Date renouvellement'].date;
    if (!dateProp || !dateProp.start) return;

    const renewalDate = new Date(dateProp.start);
    if (renewalDate >= today && renewalDate <= alertLimit) {
      const membre = getTitleText(m.properties['Membre']);
      upcoming.push(membre + ' — renouvellement le ' + dateProp.start);
    }
  });

  if (upcoming.length > 0) {
    notifyOwner(
      'Renouvellements EMS à venir (' + upcoming.length + ')',
      upcoming.join('\n')
    );
  }
}

/*==================================================
KPI MENSUEL (profit net, repartition, conversion EMS,
comparaison mois par mois — une ligne par mois)
==================================================*/

function computeMonthlyKPIs() {
  const now = new Date();
  const monthKey = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM');
  const monthStart = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), TIMEZONE, 'yyyy-MM-dd');
  const monthEnd = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0), TIMEZONE, 'yyyy-MM-dd');
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');

  // 1. Revenus (factures payées ce mois), répartis Massage vs EMS
  const facturesResult = queryNotionDataSource(DS_FACTURES, {
    filter: {
      and: [
        { property: 'Statut', select: { equals: '✅ Payée' } },
        { property: 'Date', date: { on_or_after: monthStart } },
        { property: 'Date', date: { on_or_before: monthEnd } }
      ]
    }
  });

  let revenusMassage = 0;
  let revenusEMS = 0;

  (facturesResult.results || []).forEach(function (facture) {
    try {
      const totalProp = facture.properties['Total'] && facture.properties['Total'].formula;
      const total = (totalProp && typeof totalProp.number === 'number') ? totalProp.number : 0;

      const rdvRelation = facture.properties['Rendez-vous'] && facture.properties['Rendez-vous'].relation;
      let categorie = null;

      if (rdvRelation && rdvRelation.length > 0) {
        const rdv = getNotionPage(rdvRelation[0].id);
        const serviceRelation = rdv.properties['Service'] && rdv.properties['Service'].relation;
        if (serviceRelation && serviceRelation.length > 0) {
          const service = getNotionPage(serviceRelation[0].id);
          categorie = service.properties['Catégorie'] && service.properties['Catégorie'].select && service.properties['Catégorie'].select.name;
        }
      }

      if (categorie && categorie.indexOf('EMS') !== -1) {
        revenusEMS += total;
      } else {
        revenusMassage += total;
      }
    } catch (e) {
      // ignore une facture problématique plutôt que de bloquer tout le calcul
    }
  });

  const revenusTotal = revenusMassage + revenusEMS;

  // 2. Dépenses ce mois
  const depensesResult = queryNotionDataSource(DS_DEPENSES, {
    filter: {
      and: [
        { property: 'Date', date: { on_or_after: monthStart } },
        { property: 'Date', date: { on_or_before: monthEnd } }
      ]
    }
  });

  let depensesTotal = 0;
  (depensesResult.results || []).forEach(function (dep) {
    const totalProp = dep.properties['Total'] && dep.properties['Total'].formula;
    const total = (totalProp && typeof totalProp.number === 'number') ? totalProp.number : 0;
    depensesTotal += total;
  });

  // 3. Rendez-vous confirmés ce mois
  const rdvResult = queryNotionDataSource(DS_RENDEZVOUS, {
    filter: {
      and: [
        { property: 'Statut', select: { equals: 'Confirmé' } },
        { property: 'Date', date: { on_or_after: monthStart } },
        { property: 'Date', date: { on_or_before: monthEnd } }
      ]
    }
  });
  const nbRendezVous = (rdvResult.results || []).length;

  // 4. Leads EMS reçus / convertis ce mois
  const leadsResult = queryNotionDataSource(DS_LEADS_EMS, {
    filter: {
      and: [
        { property: 'Date de la demande', date: { on_or_after: monthStart } },
        { property: 'Date de la demande', date: { on_or_before: monthEnd } }
      ]
    }
  });
  const leadsRecus = (leadsResult.results || []).length;
  const leadsConvertis = (leadsResult.results || []).filter(function (l) {
    return l.properties['Statut'] && l.properties['Statut'].select && l.properties['Statut'].select.name === 'Inscrit';
  }).length;

  // 5. Enregistre (ou met à jour) la ligne du mois dans "KPI Mensuel"
  const props = {
    'Revenus': numberProp(revenusTotal),
    'Revenus Massage': numberProp(revenusMassage),
    'Revenus EMS': numberProp(revenusEMS),
    'Dépenses': numberProp(depensesTotal),
    'Rendez-vous confirmés': numberProp(nbRendezVous),
    'Leads EMS reçus': numberProp(leadsRecus),
    'Leads EMS convertis': numberProp(leadsConvertis),
    'Dernière mise à jour': dateProp(todayStr)
  };

  const existing = queryNotionDataSource(DS_KPI_MENSUEL, {
    filter: { property: 'Mois', title: { equals: monthKey } }
  });

  if (existing.results && existing.results.length > 0) {
    const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + existing.results[0].id, {
      method: 'patch',
      headers: notionHeaders(),
      payload: JSON.stringify({ properties: props }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) {
      notifyOwner('Erreur mise à jour KPI Mensuel', res.getContentText());
    }
  } else {
    props['Mois'] = titleProp(monthKey);
    createNotionPage(DS_KPI_MENSUEL, props);
  }
}

/*==================================================
DÉPENSES RÉCURRENTES À VENIR
==================================================*/

function checkUpcomingExpenses() {
  const result = queryNotionDataSource(DS_DEPENSES, {
    filter: { property: 'Récurrent', checkbox: { equals: true } }
  });

  const today = new Date();
  const alertLimit = new Date();
  alertLimit.setDate(today.getDate() + EXPENSE_ALERT_DAYS);

  const upcoming = [];

  (result.results || []).forEach(function (dep) {
    const dueProp = dep.properties['Prochaine échéance'] && dep.properties['Prochaine échéance'].date;
    if (!dueProp || !dueProp.start) return;

    const dueDate = new Date(dueProp.start);
    if (dueDate >= today && dueDate <= alertLimit) {
      const fournisseur = getTitleText(dep.properties['Fournisseur']);
      upcoming.push(fournisseur + ' — échéance le ' + dueProp.start);
    }
  });

  if (upcoming.length > 0) {
    notifyOwner(
      'Dépenses récurrentes à venir (' + upcoming.length + ')',
      upcoming.join('\n')
    );
  }
}

function getNotionPage(pageId) {
  const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'get',
    headers: notionHeaders(),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    throw new Error('Erreur Notion (get page): ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function getPlainText(richTextProperty) {
  if (!richTextProperty || !richTextProperty.rich_text || richTextProperty.rich_text.length === 0) return '';
  return richTextProperty.rich_text.map(function (t) { return t.plain_text; }).join('');
}

function getTitleText(titleProperty) {
  if (!titleProperty || !titleProperty.title || titleProperty.title.length === 0) return '';
  return titleProperty.title.map(function (t) { return t.plain_text; }).join('');
}

/*==================================================
FICHE SANTÉ (liée au client, pas de rendez-vous)
==================================================*/

/*==================================================
FORMULAIRE DE CONTACT (message direct, pas de fiche Notion)
==================================================*/

function handleContactMessage(data) {
  const nom = (data.nom || '').trim();
  const telephone = (data.telephone || '').trim();
  const email = (data.email || '').trim();
  const sujet = (data.sujet || 'Question générale').trim();
  const message = (data.message || '').trim();

  if (!nom || !email || !message) {
    return { success: false, error: 'Champs manquants' };
  }

  // Envoie le message directement au propriétaire par courriel
  const ownerEmail = getOwnerProperty('OWNER_EMAIL', '');
  if (ownerEmail) {
    MailApp.sendEmail({
      to: ownerEmail,
      replyTo: email,
      subject: 'Nouveau message du site — ' + sujet,
      body:
        'Nouveau message reçu via le formulaire de contact du site.\n\n' +
        'Nom : ' + nom + '\n' +
        'Téléphone : ' + telephone + '\n' +
        'Courriel : ' + email + '\n' +
        'Sujet : ' + sujet + '\n\n' +
        'Message :\n' + message
    });
  }

  // Confirmation au client
  MailApp.sendEmail({
    to: email,
    subject: 'Message reçu — Clinique KinéPulse',
    body:
      'Bonjour ' + nom + ',\n\n' +
      'Merci pour votre message. Nous vous répondrons dans les plus brefs délais.' +
      EMAIL_SIGNATURE
  });

  return { success: true };
}

function handleHealthIntake(data) {
  const nom = (data.nom || '').trim();
  const telephone = (data.telephone || '').trim();
  const email = (data.email || '').trim();

  if (!nom || !telephone || !email) {
    return { success: false, error: 'Champs manquants' };
  }

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  // Trouve ou crée le client dans Notion (même logique que pour les réservations)
  const clientResult = findOrCreateClient(nom, telephone, email, 'Massage', today);
  const clientId = clientResult.id;

  const fiche = {
    'Fiche': titleProp('Fiche santé — ' + nom),
    'Client': relationProp([clientId]),
    'Adresse': richTextProp(data.adresse || ''),
    'Emploi': richTextProp(data.emploi || ''),
    'Assurance': selectProp(data.assurance === 'Oui' ? 'Oui' : 'Non'),
    "Compagnie d'assurance": richTextProp(data.compagnieAssurance || ''),
    'Antécédents médicaux': richTextProp(data.antecedents || ''),
    'Médicaments actuels': richTextProp(data.medicaments || ''),
    'Blessures / douleurs actuelles': richTextProp(data.blessures || ''),
    'But de la séance': richTextProp(data.objectif || ''),
    'Date de remplissage': dateProp(today)
  };

  // Une seule fiche santé par client — si elle existe déjà (peu importe si
  // elle vient d'une réservation massage ou EMS), on la MET À JOUR au lieu
  // d'en créer une deuxième.
  const existingFiche = queryNotionDataSource(DS_FICHE_SANTE, {
    filter: { property: 'Client', relation: { contains: clientId } }
  });

  if (existingFiche.results && existingFiche.results.length > 0) {
    const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + existingFiche.results[0].id, {
      method: 'patch',
      headers: notionHeaders(),
      payload: JSON.stringify({ properties: fiche }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) {
      throw new Error('Erreur Notion (update fiche santé): ' + res.getContentText());
    }
  } else {
    createNotionPage(DS_FICHE_SANTE, fiche);
  }

  MailApp.sendEmail({
    to: email,
    subject: 'Fiche santé reçue — Clinique KinéPulse',
    body:
      'Bonjour ' + nom + ',\n\n' +
      'Merci ! Votre fiche santé a bien été reçue et sera consultée avant votre visite.\n\n' +
      'À bientôt.' +
      EMAIL_SIGNATURE
  });

  notifyOwner(
    'Nouvelle fiche santé — ' + nom,
    nom + ' a rempli sa fiche santé.\nTéléphone: ' + telephone + '\nCourriel: ' + email +
    '\nConsultez Notion "Fiche santé" pour le détail.'
  );

  return { success: true };
}

function clientAlreadyHasHealthForm(telephone, knownClientId) {
  let clientId = knownClientId;

  if (!clientId) {
    const clientMatch = queryNotionDataSource(DS_CLIENTS, {
      filter: { property: 'Téléphone', phone_number: { equals: telephone } }
    });
    if (!clientMatch.results || clientMatch.results.length === 0) return false;
    clientId = clientMatch.results[0].id;
  }

  const ficheMatch = queryNotionDataSource(DS_FICHE_SANTE, {
    filter: { property: 'Client', relation: { contains: clientId } }
  });

  return !!(ficheMatch.results && ficheMatch.results.length > 0);
}

/*==================================================
CLIENTS CRM — TROUVE OU CRÉE
==================================================*/

function findOrCreateClient(nom, telephone, email, typeClient, visitDateStr) {
  const existing = queryNotionDataSource(DS_CLIENTS, {
    filter: { property: 'Téléphone', phone_number: { equals: telephone } }
  });

  if (existing.results && existing.results.length > 0) {
    const clientId = existing.results[0].id;

    // Client existant: on met à jour seulement "Dernière visite".
    // "Date première visite" ne bouge jamais une fois fixée.
    try {
      const props = { 'Dernière visite': dateProp(visitDateStr) };
      const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + clientId, {
        method: 'patch',
        headers: notionHeaders(),
        payload: JSON.stringify({ properties: props }),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() >= 300) {
        throw new Error(res.getContentText());
      }
    } catch (updateErr) {
      notifyOwner('Mise à jour "Dernière visite" échouée', updateErr.message);
    }

    return { id: clientId, isNew: false };
  }

  const created = createNotionPage(DS_CLIENTS, {
    'Nom complet': titleProp(nom),
    'Téléphone': phoneProp(telephone),
    'Email': emailProp(email),
    'Type client': selectProp(typeClient),
    'Date première visite': dateProp(visitDateStr),
    'Dernière visite': dateProp(visitDateStr)
  });

  return { id: created.id, isNew: true };
}

/*==================================================
NOTION — HELPERS API
==================================================*/

function notionHeaders() {
  return {
    'Authorization': 'Bearer ' + getOwnerProperty('NOTION_TOKEN', ''),
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

function createNotionPage(dataSourceId, properties) {
  const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: notionHeaders(),
    payload: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: properties
    }),
    muteHttpExceptions: true
  });

  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 300) {
    throw new Error('Erreur Notion (create): ' + res.getContentText());
  }
  return body;
}

function queryNotionDataSource(dataSourceId, body) {
  const res = UrlFetchApp.fetch('https://api.notion.com/v1/data_sources/' + dataSourceId + '/query', {
    method: 'post',
    headers: notionHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    throw new Error('Erreur Notion (query): ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

// Constructeurs de propriétés Notion (format API standard)
function titleProp(text) {
  return { title: [{ text: { content: String(text).substring(0, 2000) } }] };
}
function richTextProp(text) {
  return { rich_text: [{ text: { content: String(text).substring(0, 2000) } }] };
}
function selectProp(name) {
  return { select: { name: String(name) } };
}
function phoneProp(value) {
  return { phone_number: String(value) };
}
function emailProp(value) {
  return { email: String(value) };
}
function dateProp(isoDate) {
  return { date: { start: isoDate } };
}
function relationProp(ids) {
  return { relation: ids.map(function (id) { return { id: id }; }) };
}
function numberProp(n) {
  return { number: n };
}

/*==================================================
UTILITAIRES
==================================================*/

function getOwnerProperty(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value || fallback;
}

function notifyOwner(subject, body) {
  const ownerEmail = getOwnerProperty('OWNER_EMAIL', '');
  if (!ownerEmail) return;
  MailApp.sendEmail({ to: ownerEmail, subject: subject, body: body });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testRechercheDepense() {
  const threads = GmailApp.search('subject:depense has:attachment is:unread', 0, 20);
  Logger.log('Nombre de fils trouvés (avec filtre complet) : ' + threads.length);

  const threads2 = GmailApp.search('subject:depense', 0, 20);
  Logger.log('Nombre de fils trouvés (juste "depense" dans le sujet) : ' + threads2.length);

  threads2.forEach(function (t) {
    const msg = t.getMessages()[0];
    Logger.log('Sujet: "' + msg.getSubject() + '" | Non lu: ' + msg.isUnread() +
               ' | Pièces jointes: ' + msg.getAttachments().length +
               ' | De: ' + msg.getFrom());
  });
}
