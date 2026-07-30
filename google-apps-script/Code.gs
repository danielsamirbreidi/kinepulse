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

const EMAIL_SIGNATURE =
  '\n\n—\n' +
  'Clinique KinéPulse\n' +
  '13301 Rue Sherbrooke E, bureau 216, Montréal, QC H1A 1C2\n' +
  '(263) 378-2247 · cliniquekinepulse@gmail.com';

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
      (client.isNew
        ? 'Pour sauver du temps sur place, prenez 3 minutes pour remplir votre fiche santé avant votre visite :\n' +
          'https://danielsamirbreidi.github.io/kinepulse/pages/fiche-sante.html\n\n'
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

  MailApp.sendEmail({
    to: email,
    subject: 'Votre demande de consultation EMS — Clinique KinéPulse',
    body:
      'Bonjour ' + nom + ',\n\n' +
      'Merci pour votre demande de consultation EMS.\n' +
      'Nous avons bien reçu vos informations et nous vous contacterons ' +
      'sous peu afin de planifier votre séance.\n\n' +
      'Pour sauver du temps, vous pouvez déjà remplir votre fiche santé :\n' +
      'https://danielsamirbreidi.github.io/kinepulse/pages/fiche-sante.html\n\n' +
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
    .everyHours(1)
    .create();
}

/*==================================================
SYNCHRONISATION CALENDAR -> NOTION
(pour les rendez-vous ajoutés manuellement dans Google
Calendar, hors du site — copie vers Notion "Rendez-Vous"
s'ils n'y sont pas déjà)
==================================================*/

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
    const evDate = Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'yyyy-MM-dd');
    const evTime = Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'HH:mm');
    const key = evDate + '|' + evTime;

    if (known[key]) return; // déjà dans Notion (probablement créé par le site)

    try {
      createNotionPage(DS_RENDEZVOUS, {
        'Rendez-vous': titleProp('📅 ' + ev.getTitle()),
        'Date': dateProp(evDate),
        'Heure': richTextProp(evTime),
        'Thérapeute': selectProp('Daniel'),
        'Statut': selectProp('Confirmé')
      });
      known[key] = true;
    } catch (syncErr) {
      // On ignore silencieusement (ex: événement personnel sans lien avec la clinique)
    }
  });
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

  createNotionPage(DS_FICHE_SANTE, {
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
  });

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
