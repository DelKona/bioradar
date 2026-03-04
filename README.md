# BioRadar — Veille Scientifique Multi-Sources

## Architecture

```
bioradar-prod/
├── public/
│   └── index.html          ← Frontend (HTML/CSS/JS unique)
├── api/
│   ├── papers.js            ← API serverless : fetch 8 sources scientifiques
│   └── editorial.js         ← API serverless : résumé IA via Claude
├── vercel.json              ← Config Vercel (routes, env)
├── package.json
├── .env.example
└── README.md
```

**Frontend** → `public/index.html` (fichier unique, ~5300 lignes)
**Backend** → `api/papers.js` et `api/editorial.js` (Vercel Serverless Functions)

Le frontend appelle `/api/papers` pour charger les articles et `/api/editorial` pour générer les résumés IA. Plus aucun appel API direct depuis le navigateur = plus de problèmes CORS.

---

## Déploiement sur Vercel (5 minutes)

### 1. Prérequis

- Compte GitHub : https://github.com
- Compte Vercel : https://vercel.com (gratuit, sign-up avec GitHub)
- Clé API Anthropic : https://console.anthropic.com

### 2. Pousser le code sur GitHub

```bash
# Créer un nouveau repo sur GitHub (ex: bioradar)
# Puis dans ce dossier :
git init
git add .
git commit -m "BioRadar v1"
git remote add origin https://github.com/VOTRE-USER/bioradar.git
git push -u origin main
```

### 3. Connecter à Vercel

1. Aller sur https://vercel.com/new
2. Importer le repo GitHub `bioradar`
3. **Framework Preset** : `Other`
4. **Root Directory** : laisser vide (racine)
5. **Environment Variables** — ajouter :
   - `ANTHROPIC_API_KEY` = votre clé `sk-ant-api03-...`
   - `OPENALEX_KEY` = votre email (pour identification OpenAlex)
6. Cliquer **Deploy**

→ En 30 secondes, votre site est en ligne sur `bioradar-xxx.vercel.app`

### 4. Domaine personnalisé (optionnel)

1. Acheter un domaine sur [Namecheap](https://namecheap.com) ou [Cloudflare](https://cloudflare.com) (~12$/an)
2. Dans Vercel → Settings → Domains → Add
3. Suivre les instructions DNS (ajouter un CNAME vers `cname.vercel-dns.com`)

---

## Sources scientifiques (8 APIs)

| Source | Type | Couverture |
|--------|------|-----------|
| OpenAlex | Métadonnées | 250M+ articles, toutes disciplines |
| Europe PMC | Full-text | Biomédical, accès ouvert |
| Semantic Scholar | Citations | CS, biomédical, citations |
| Crossref | DOI/métadonnées | 140M+ articles enregistrés |
| PubMed | Médical | 36M+ articles biomédicaux |
| DOAJ | Open Access | 9M+ articles OA |
| bioRxiv/medRxiv | Preprints | Bio/médical, non peer-reviewed |
| arXiv | Preprints | Physique, CS, math, IA |

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Clé API Claude pour les résumés IA |
| `OPENALEX_KEY` | Non | Email pour identification OpenAlex (augmente le rate limit) |

### Configurer en local

```bash
cp .env.example .env
# Éditer .env avec vos clés
npm install
npm run dev
```

### Configurer sur Vercel

```bash
vercel env add ANTHROPIC_API_KEY
# Entrer la valeur : sk-ant-api03-...
vercel env add OPENALEX_KEY
# Entrer la valeur : votre-email@example.com
```

---

## Coûts estimés

| Service | Coût | Limite gratuite |
|---------|------|----------------|
| Vercel (hosting) | Gratuit | 100 GB bandwidth, 100k function calls/mois |
| Anthropic Claude | ~0.003$/résumé | Selon forfait |
| Domaine | ~12$/an | — |
| OpenAlex, PubMed, etc. | Gratuit | Illimité (APIs publiques) |

**Estimation mensuelle pour 100 utilisateurs actifs** : ~5-10$/mois (surtout l'API Claude)

---

## Développement local

```bash
npm install
npm run dev
# → http://localhost:3000
```

Les API routes sont disponibles sur `http://localhost:3000/api/papers` et `/api/editorial`.

---

## Évolutions futures

- [ ] **Supabase Auth** : remplacer localStorage par une vraie auth
- [ ] **Supabase DB** : persister profils et préférences côté serveur
- [ ] **Cron jobs** : pré-fetcher les articles toutes les 6h via Vercel Cron
- [ ] **Push notifications** : alerter les utilisateurs de nouvelles publications
- [ ] **PDF export** : générer un digest PDF quotidien
- [ ] **API publique** : exposer `/api/papers` comme service pour d'autres apps
