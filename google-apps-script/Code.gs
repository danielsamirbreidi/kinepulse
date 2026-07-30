/*==================================================
KINÉPULSE — BACKEND DE RÉSERVATION
Google Apps Script

Ce script fait 3 choses:
1. Expose la liste des créneaux de massage réellement libres
   (calculés depuis ton horaire fixe, moins ce qui est déjà
   pris dans Google Calendar)
2. Quand un massage est réservé: crée l'événement dans Google
   Calendar + une fiche dans Notion (Rendez-Vous) + envoie une
   confirmation immédiate au client
3. Quand une demande EMS est envoyée: crée seulement une fiche
   dans Notion (Leads EMS, PAS de rendez-vous) + envoie un
   message "on vous contactera" au client

==================================================
CONFIGURATION REQUISE (Extensions > Propriétés du script)
==================================================
NOTION_TOKEN       -> ton "Internal Integration Secret" (ntn_...)
OWNER_EMAIL        -> ton adresse courriel (pour les notifications)
CLINIC_ADDRESS     -> adresse de la clinique (pour les courriels)
==================================================
*/

const NOTION_VERSION = '2025-09-03';
const TIMEZONE = 'America/Toronto';

// IDs des "data sources" Notion (obtenus via l'intégration KinéPulse Site)
const DS_RENDEZVOUS = '3aa36ea7-3613-8049-82d0-000b6ac93dea';
const DS_CLIENTS    = '39936ea7-3613-8005-86b9-000b8195be50';
const DS_LEADS_EMS  = 'bb23ddce-e51d-487e-9eb5-4c20590d5889';

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

const BOOKING_WINDOW_DAYS = 21; // combien de jours à l'avance on ouvre la réservation

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

  for (let d = 0; d < BOOKING_WINDOW_DAYS; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const dayOfWeek = day.getDay();
    const times = MASSAGE_SLOTS[dayOfWeek] || [];

    times.forEach(function (timeStr) {
      const startDate = buildDateTime(day, timeStr);

      // On ignore les créneaux déjà passés aujourd'hui
      if (startDate <= now) return;

      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
      const conflicts = calendar.getEvents(startDate, endDate);

      if (conflicts.length === 0) {
        slots.push({
          date: Utilities.formatDate(day, TIMEZONE, 'yyyy-MM-dd'),
          time: timeStr,
          label: Utilities.formatDate(day, TIMEZONE, 'EEEE d MMMM') + ' — ' + timeStr
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

  // 3. Trouve ou crée le client dans Notion
  const clientId = findOrCreateClient(nom, telephone, email, 'Massage');

  // 4. Crée la fiche Rendez-Vous dans Notion
  const serviceId = duration === 90 ? SERVICE_MASSAGE_90 : SERVICE_MASSAGE_60;
  createNotionPage(DS_RENDEZVOUS, {
    'Rendez-vous': titleProp('Massage ' + duration + ' min — ' + nom),
    'Date': dateProp(dateStr),
    'Heure': richTextProp(timeStr),
    'Client': relationProp([clientId]),
    'Service': relationProp([serviceId]),
    'Thérapeute': selectProp('Daniel'),
    'Statut': selectProp('Confirmé')
  });

  // 5. Confirmation au client
  const dateLisible = Utilities.formatDate(day, TIMEZONE, "EEEE d MMMM yyyy");
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
      'Au plaisir de vous accueillir.\n\n' +
      'Clinique KinéPulse'
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
      'Au plaisir de vous accompagner.\n\n' +
      'Clinique KinéPulse'
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
CLIENTS CRM — TROUVE OU CRÉE
==================================================*/

function findOrCreateClient(nom, telephone, email, typeClient) {
  const existing = queryNotionDataSource(DS_CLIENTS, {
    filter: { property: 'Téléphone', phone_number: { equals: telephone } }
  });

  if (existing.results && existing.results.length > 0) {
    return existing.results[0].id;
  }

  const today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  const created = createNotionPage(DS_CLIENTS, {
    'Nom complet': titleProp(nom),
    'Téléphone': phoneProp(telephone),
    'Email': emailProp(email),
    'Type client': selectProp(typeClient),
    'Date première visite': dateProp(today)
  });

  return created.id;
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
