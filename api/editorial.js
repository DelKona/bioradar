// /api/editorial.js — Vercel Serverless Function
// Generates AI editorial summaries using Claude API (server-side, key protected)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const {
    papers = [],
    profile = 'Chercheur·se',
    summaryStyle = 'analytique',
    domains = [],
    subdomains = [],
    periodLabel = "aujourd'hui",
    periodDays = 1,
    firstName = '',
    lastName = '',
    institution = '',
    mode = 'editorial', // 'editorial' | 'executive' | 'deep'
  } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  if (papers.length === 0) {
    return res.status(400).json({ error: 'No papers provided' });
  }

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const domainNames = domains.join(', ') || 'sciences générales';
  const subdomainNames = subdomains.join(', ');

  // Build numbered article summaries
  const topPapers = papers.slice(0, mode === 'deep' ? 20 : 12);
  const pubSummaries = topPapers.map((p, i) => {
    const authorShort = (p.authors || '').split(',')[0].trim();
    return `[${i + 1}] "${p.title}"\n    Auteurs: ${authorShort || 'Non spécifié'} et al.\n    Source: ${p.server || 'preprint'} · ${p.date || ''}\n    Résumé: ${(p.abstract || '').slice(0, mode === 'deep' ? 600 : 400)}`;
  }).join('\n\n');

  const styleDesc = {
    analytique: "scientifique et technique — terminologie précise, méthodologies, données quantitatives",
    narratif: "journalistique et captivant — accroche forte, impact sociétal, transitions fluides",
    synthétique: "ultra-condensé — faits clés, phrases courtes, maximum de densité",
    pédagogique: "accessible — termes définis, analogies, progression logique"
  }[summaryStyle] || "informatif et accessible";

  const profileInstructions = {
    'Chercheur·se': "Jargon technique, méthodologies, comparaison avec l'état de l'art.",
    'Scientifique R&D': "Potentiel translationnel, brevets, applications commerciales.",
    'Postdoc / Doctorant·e': "Positionnement dans la littérature, forces/limites, pistes futures.",
    'Étudiant·e': "Contexte et concepts de base, analogies, acronymes définis.",
    'Journaliste Scientifique': "Angle surprenant, chiffres concrets, impact sociétal.",
    'Médecin / Clinicien·ne': "Implications cliniques, résultats d'essais, cibles thérapeutiques.",
    'Investisseur·se / BD': "Valorisation IP, taille de marché, potentiel de deals.",
    'Ingénieur·e': "Applications concrètes, faisabilité technique, performances mesurées.",
    'Enseignant·e': "Organisation progressive, angles pédagogiques, liens curriculum.",
    'Curieux·se Éclairé·e': "Vulgarisation élégante, rigueur accessible."
  }[profile] || "Informatif et accessible.";

  // Build prompt based on mode
  let modeInstructions;
  let maxTokens;

  if (mode === 'executive') {
    maxTokens = 800;
    modeInstructions = `Écris un EXECUTIVE BRIEF ultra-condensé. 
Format: 5-7 bullet points en HTML (<ul><li>), chacun = 1 article clé avec son impact. 
Commence par une phrase d'accroche de 15 mots max.
Chaque bullet DOIT avoir une référence [N].`;
  } else if (mode === 'deep') {
    maxTokens = 2500;
    modeInstructions = `Écris une ANALYSE APPROFONDIE de 500-600 mots.
Structure: 5-6 paragraphes <p> avec une analyse détaillée de chaque article.
Inclus les données quantitatives, les méthodologies, les limites, et les implications.
Chaque paragraphe DOIT citer au moins 2 articles avec références [N].
Termine par une section "Perspectives" sur les implications futures.`;
  } else {
    maxTokens = 1800;
    modeInstructions = `Écris un résumé éditorial de 250-350 mots.
3-4 paragraphes <p>. Chaque fait DOIT avoir une référence [N] vers un article.
Au moins 5 références différentes. 
P1: découverte principale. P2: autres résultats. P3: synthèse. P4 (optionnel): perspectives.`;
  }

  const prompt = `Tu es l'éditorialiste scientifique de BioRadar. Date: ${today}. Période: ${periodLabel}.

PROFIL: ${profile} · ${profileInstructions}
STYLE: ${styleDesc}
DOMAINES: ${domainNames}${subdomainNames ? '\nSOUS-DOMAINES PRIORITAIRES: ' + subdomainNames : ''}

═══ ARTICLES À ANALYSER ═══
${pubSummaries}

═══ MISSION ═══
${modeInstructions}

RÈGLE CRITIQUE: Insère des références [1], [2], [3]... dans le texte. Le numéro = celui de l'article dans la liste.

Format JSON STRICT:
{
  "title": "Titre accrocheur SPÉCIFIQUE (max 80 car). <em> pour sous-titre.",
  "body": "<p>Contenu avec références [X]...</p>",
  "signals": [
    {"title":"SIGNAL MAJUSCULES","text":"Description ~50 mots avec ref [X]"},
    {"title":"SIGNAL 2","text":"..."},
    {"title":"SIGNAL 3","text":"..."}
  ]
}

UNIQUEMENT le JSON. Pas de backticks, pas de commentaires.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ error: `Claude API: ${err}` });
    }

    const data = await resp.json();
    const text = (data.content || []).map(c => c.text || '').join('').trim();

    let editorial;
    try {
      const cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      editorial = JSON.parse(cleanText);
    } catch (e) {
      return res.status(200).json({
        success: false,
        error: 'JSON parse failed',
        rawText: text.slice(0, 500),
      });
    }

    return res.status(200).json({
      success: true,
      editorial,
      articlesAnalyzed: topPapers.length,
      mode,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
