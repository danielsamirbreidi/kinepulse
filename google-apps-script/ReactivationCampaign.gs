/**
 * Campagne de réactivation — base de patients dormante (ex-employeur)
 * ============================================================================
 * Ce fichier vit dans le MÊME projet Apps Script que Code.gs (donc les
 * fonctions utilitaires de Code.gs — getOwnerProperty, notifyOwner — sont
 * réutilisées ici directement, pas besoin de les redéfinir).
 *
 * SÉCURITÉ — RIEN NE PART AUX VRAIS PATIENTS PAR ACCIDENT :
 *   1. previewReactivationEmail()   -> affiche le courriel dans les logs,
 *      n'envoie RIEN, ne touche à rien.
 *   2. sendReactivationTest()       -> envoie UNIQUEMENT aux adresses de test
 *      (REACTIVATION_TEST_EMAILS), ne touche jamais la feuille de suivi.
 *   3. sendReactivationCampaign()   -> l'envoi réel. Refuse de s'exécuter
 *      tant que la propriété de script REACTIVATION_CONFIRM_SEND n'est pas
 *      exactement "OUI_ENVOYER". C'est un interrupteur volontairement
 *      pénible à activer pour éviter un envoi accidentel aux 936 patients.
 *
 * CONFIGURATION REQUISE (Paramètres du projet -> Propriétés du script) :
 *   REACTIVATION_SHEET_ID     -> ID du Google Sheet contenant les patients
 *                                 (importe ton CSV/Excel dans Sheets d'abord,
 *                                 puis copie l'ID depuis l'URL du fichier)
 *   REACTIVATION_TEST_EMAILS  -> tes adresses de test, séparées par virgules
 *   REACTIVATION_CONFIRM_SEND -> laisser vide/absent tant que le message
 *                                 n'est pas validé. Mettre "OUI_ENVOYER"
 *                                 seulement quand tu es prêt à envoyer aux
 *                                 vrais patients.
 *
 * FORMAT ATTENDU DE L'ONGLET "Patients" DU GOOGLE SHEET (ligne 1 = en-têtes) :
 *   A: Nom | B: Courriel | C: Téléphone | D: Statut | E: Date envoi
 *   (D et E sont remplies automatiquement par le script, laisse-les vides
 *   au départ — ou mets "Désabonné" à la main pour exclure quelqu'un)
 * ============================================================================
 */

const REACTIVATION_SHEET_TAB = 'Patients';
const REACTIVATION_BATCH_SIZE = 450; // marge de sécurité sous la limite Gmail (500/jour, compte perso)
const REACTIVATION_COL = {
  NOM: 0,
  COURRIEL: 1,
  TELEPHONE: 2,
  STATUT: 3,
  DATE_ENVOI: 4
};

// ---------------------------------------------------------------------------
// Accès à la feuille
// ---------------------------------------------------------------------------

function getReactivationSheet_() {
  const sheetId = getOwnerProperty('REACTIVATION_SHEET_ID', '');
  if (!sheetId) {
    throw new Error(
      "Propriété de script REACTIVATION_SHEET_ID manquante. Va dans " +
      "Paramètres du projet -> Propriétés du script et ajoute l'ID de ton " +
      "Google Sheet (visible dans l'URL du fichier)."
    );
  }
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(REACTIVATION_SHEET_TAB);
  if (!sheet) {
    throw new Error(
      "Onglet \"" + REACTIVATION_SHEET_TAB + "\" introuvable dans le Google " +
      "Sheet. Crée un onglet avec ce nom exact et les colonnes Nom, " +
      "Courriel, Téléphone, Statut, Date envoi."
    );
  }
  return sheet;
}

function getReactivationTestEmails_() {
  const raw = getOwnerProperty('REACTIVATION_TEST_EMAILS', '');
  return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Contenu du courriel — BROUILLON À VALIDER AVANT TOUT ENVOI RÉEL
// ---------------------------------------------------------------------------

function buildReactivationEmail_(nom) {
  const prenom = (nom || '').trim().split(' ')[0] || 'Bonjour';

  const subject = prenom + ', on a rouvert — offre de bienvenue chez KinéPulse';

  // TODO (toi) : valider/ajuster le texte et l'offre exacte avant tout envoi réel.
  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px;margin:0 auto;">' +
    '<p>Bonjour ' + prenom + ',</p>' +
    '<p>Ça fait un moment ! Je t’écris parce que tu as été client(e) chez ' +
    'moi par le passé, et je voulais te partager la nouvelle : ' +
    '<strong>KinéPulse</strong> est maintenant ouverte, ma propre clinique de ' +
    'kinésithérapie, massothérapie et entraînement EMS à Pointe-aux-Trembles.</p>' +
    '<p><strong>[OFFRE DE LANCEMENT À CONFIRMER]</strong> — par exemple : ' +
    '20 % de rabais sur ta première visite si tu réserves avant le [date].</p>' +
    '<p><a href="https://kinepulse.ca/pages/contact.html" ' +
    'style="display:inline-block;background:#0d6efd;color:#fff;padding:10px 18px;' +
    'border-radius:6px;text-decoration:none;">Réserver mon rendez-vous</a></p>' +
    '<p>Au plaisir de te retrouver,<br>L’équipe KinéPulse</p>' +
    '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">' +
    '<p style="font-size:12px;color:#777;">' +
    'KinéPulse — 13301 Rue Sherbrooke E, bureau 216, Montréal (Pointe-aux-Trembles), QC H1A 1C2<br>' +
    'info@kinepulse.ca<br>' +
    'Pour ne plus recevoir nos communications, réponds simplement « ARRÊT » à ce courriel.' +
    '</p>' +
    '</div>';

  return { subject: subject, htmlBody: htmlBody };
}

// ---------------------------------------------------------------------------
// 1. Aperçu seul — n'envoie rien, ne touche à rien
// ---------------------------------------------------------------------------

function previewReactivationEmail() {
  const sheet = getReactivationSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[REACTIVATION_COL.COURRIEL] && row[REACTIVATION_COL.STATUT] !== 'Envoyé') {
      const email = buildReactivationEmail_(row[REACTIVATION_COL.NOM]);
      Logger.log('--- APERÇU (patient exemple : %s) ---', row[REACTIVATION_COL.NOM]);
      Logger.log('Sujet : %s', email.subject);
      Logger.log('Corps HTML :\n%s', email.htmlBody);
      return;
    }
  }
  Logger.log('Aucun patient éligible trouvé pour générer un aperçu.');
}

// ---------------------------------------------------------------------------
// 2. Envoi de test — seulement vers REACTIVATION_TEST_EMAILS, jamais aux patients
// ---------------------------------------------------------------------------

function sendReactivationTest() {
  const testEmails = getReactivationTestEmails_();
  if (testEmails.length === 0) {
    throw new Error(
      "Propriété REACTIVATION_TEST_EMAILS manquante. Ajoute tes adresses " +
      "de test (séparées par virgules) dans les propriétés du script."
    );
  }

  const sheet = getReactivationSheet_();
  const data = sheet.getDataRange().getValues();
  let exampleNom = 'Test';
  for (let i = 1; i < data.length; i++) {
    if (data[i][REACTIVATION_COL.NOM]) {
      exampleNom = data[i][REACTIVATION_COL.NOM];
      break;
    }
  }

  const email = buildReactivationEmail_(exampleNom);

  testEmails.forEach(function (to) {
    MailApp.sendEmail({
      to: to,
      subject: '[TEST] ' + email.subject,
      htmlBody: email.htmlBody,
      replyTo: 'info@kinepulse.ca'
    });
  });

  Logger.log('Courriel de test envoyé à : %s', testEmails.join(', '));
  Logger.log('Aucune ligne du Google Sheet n\'a été modifiée.');
}

// ---------------------------------------------------------------------------
// 3. Envoi réel — verrouillé tant que REACTIVATION_CONFIRM_SEND != "OUI_ENVOYER"
// ---------------------------------------------------------------------------

function sendReactivationCampaign() {
  const confirm = getOwnerProperty('REACTIVATION_CONFIRM_SEND', '');
  if (confirm !== 'OUI_ENVOYER') {
    throw new Error(
      'ENVOI BLOQUÉ : la propriété de script REACTIVATION_CONFIRM_SEND doit ' +
      'être exactement "OUI_ENVOYER" pour lancer un envoi réel aux patients. ' +
      'Utilise previewReactivationEmail() et sendReactivationTest() avant.'
    );
  }

  const sheet = getReactivationSheet_();
  const data = sheet.getDataRange().getValues();
  const remainingQuota = MailApp.getRemainingDailyQuota();
  const limit = Math.min(REACTIVATION_BATCH_SIZE, remainingQuota);

  let sentCount = 0;
  let skippedNoEmail = 0;

  for (let i = 1; i < data.length && sentCount < limit; i++) {
    const row = data[i];
    const nom = row[REACTIVATION_COL.NOM];
    const courriel = row[REACTIVATION_COL.COURRIEL];
    const statut = row[REACTIVATION_COL.STATUT];

    if (statut === 'Envoyé' || statut === 'Désabonné') continue;
    if (!courriel) { skippedNoEmail++; continue; }

    const email = buildReactivationEmail_(nom);

    MailApp.sendEmail({
      to: courriel,
      subject: email.subject,
      htmlBody: email.htmlBody,
      replyTo: 'info@kinepulse.ca'
    });

    sheet.getRange(i + 1, REACTIVATION_COL.STATUT + 1).setValue('Envoyé');
    sheet.getRange(i + 1, REACTIVATION_COL.DATE_ENVOI + 1).setValue(new Date());
    sentCount++;
  }

  notifyOwner(
    'Campagne de réactivation — lot envoyé',
    sentCount + ' courriel(s) envoyé(s) dans ce lot. ' +
    skippedNoEmail + ' ligne(s) ignorée(s) (courriel manquant). ' +
    'Relance sendReactivationCampaign() demain pour continuer la liste ' +
    '(quota Gmail quotidien atteint ou liste terminée).'
  );

  Logger.log('%s courriels envoyés. %s ignorés (pas de courriel).', sentCount, skippedNoEmail);
}

// ---------------------------------------------------------------------------
// Déclencheur quotidien (optionnel) — envoie un lot chaque jour automatiquement
// tant que REACTIVATION_CONFIRM_SEND reste à "OUI_ENVOYER"
// ---------------------------------------------------------------------------

function setupReactivationTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReactivationCampaign') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendReactivationCampaign')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  Logger.log('Déclencheur quotidien créé (9h). Il enverra un lot par jour tant que la liste n\'est pas épuisée.');
}

// ---------------------------------------------------------------------------
// Gestion des désabonnements (réponses "ARRÊT")
// ---------------------------------------------------------------------------

function processReactivationUnsubscribes() {
  const threads = GmailApp.search('to:info@kinepulse.ca (arrêt OR arret OR stop OR désabonn OR desabonn)', 0, 50);
  const sheet = getReactivationSheet_();
  const data = sheet.getDataRange().getValues();
  let updated = 0;

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      const from = message.getFrom();
      const emailMatch = from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (!emailMatch) return;
      const fromEmail = emailMatch[0].toLowerCase();

      for (let i = 1; i < data.length; i++) {
        const courriel = String(data[i][REACTIVATION_COL.COURRIEL] || '').toLowerCase();
        if (courriel === fromEmail && data[i][REACTIVATION_COL.STATUT] !== 'Désabonné') {
          sheet.getRange(i + 1, REACTIVATION_COL.STATUT + 1).setValue('Désabonné');
          updated++;
        }
      }
    });
    thread.markRead();
  });

  Logger.log('%s patient(s) marqué(s) "Désabonné".', updated);
}
