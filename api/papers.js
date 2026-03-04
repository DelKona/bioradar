// /api/papers.js — Vercel Serverless Function
// Fetches from all scientific sources server-side (no CORS issues)

const SOURCES = {
  biorxiv:    'https://api.biorxiv.org/details/biorxiv',
  medrxiv:    'https://api.biorxiv.org/details/medrxiv',
  europepmc:  'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
  semantic:   'https://api.semanticscholar.org/graph/v1/paper/search',
  crossref:   'https://api.crossref.org/works',
  openalex:   'https://api.openalex.org/works',
  doaj:       'https://doaj.org/api/search/articles',
  pubmed_search: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
  pubmed_detail: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
  arxiv:      'https://export.arxiv.org/api/query',
  core:       'https://api.core.ac.uk/v3/search/works',
  springer:   'https://api.springernature.com/openaccess/json',
  // BASE requires IP whitelist — prepared for future activation
  // base:    'https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi',
};

const OPENALEX_KEY = process.env.OPENALEX_KEY || 'lXD9E7r25bzBRbcyUrPUNa';
const CORE_API_KEY = process.env.CORE_API_KEY || ''; // Free registration at core.ac.uk
const SPRINGER_API_KEY = process.env.SPRINGER_API_KEY || ''; // Free at dev.springernature.com

// Helper: fetch with timeout
async function fetchSafe(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Date helper
function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ═══════════ SOURCE FETCHERS ═══════════

async function fetchBiorxiv(start, end) {
  try {
    const resp = await fetchSafe(`${SOURCES.biorxiv}/${start}/${end}/0/30/json`);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.collection || []).map(p => ({
      doi: p.doi || '', title: p.title || '',
      authors: p.authors || '', abstract: (p.abstract || '').slice(0, 500),
      date: p.date || '', server: 'bioRxiv', source: 'biorxiv',
    }));
  } catch { return []; }
}

async function fetchMedrxiv(start, end) {
  try {
    const resp = await fetchSafe(`${SOURCES.medrxiv}/${start}/${end}/0/20/json`);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.collection || []).map(p => ({
      doi: p.doi || '', title: p.title || '',
      authors: p.authors || '', abstract: (p.abstract || '').slice(0, 500),
      date: p.date || '', server: 'medRxiv', source: 'medrxiv',
    }));
  } catch { return []; }
}

async function fetchEuropePMC(query) {
  try {
    const url = `${SOURCES.europepmc}?query=${encodeURIComponent(query)}&resultType=core&pageSize=25&format=json&sort=date`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.resultList?.result || []).map(p => ({
      doi: p.doi || '', title: p.title || '',
      authors: (p.authorString || ''), abstract: (p.abstractText || '').slice(0, 500),
      date: p.firstPublicationDate || '', server: p.journalTitle || 'Europe PMC',
      source: 'europepmc', isOpenAccess: p.isOpenAccess === 'Y',
    }));
  } catch { return []; }
}

async function fetchSemantic(terms) {
  try {
    const year = new Date().getFullYear();
    const url = `${SOURCES.semantic}?query=${encodeURIComponent(terms)}&fields=title,authors,abstract,year,externalIds,publicationDate&limit=20&year=${year}`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.data || []).map(p => ({
      doi: p.externalIds?.DOI || '', title: p.title || '',
      authors: (p.authors || []).map(a => a.name).join(', '),
      abstract: (p.abstract || '').slice(0, 500),
      date: p.publicationDate || `${p.year || ''}-01-01`,
      server: 'Semantic Scholar', source: 'semantic',
    }));
  } catch { return []; }
}

async function fetchCrossref(terms, periodDays) {
  try {
    const from = getDateStr(-periodDays);
    const to = getDateStr(0);
    const url = `${SOURCES.crossref}?query=${encodeURIComponent(terms)}&filter=from-pub-date:${from},until-pub-date:${to}&rows=15&sort=published&order=desc`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.message?.items || []).map(p => ({
      doi: p.DOI || '', title: (p.title || [''])[0],
      authors: (p.author || []).map(a => `${a.given || ''} ${a.family || ''}`).join(', '),
      abstract: (p.abstract || '').replace(/<[^>]*>/g, '').slice(0, 500),
      date: p.published?.['date-parts']?.[0]?.join('-') || '',
      server: (p['container-title'] || ['Crossref'])[0], source: 'crossref',
    }));
  } catch { return []; }
}

async function fetchOpenAlex(terms, periodDays) {
  try {
    const fromDate = getDateStr(-periodDays);
    const url = `${SOURCES.openalex}?search=${encodeURIComponent(terms)}&filter=from_publication_date:${fromDate}&per_page=25&sort=publication_date:desc&mailto=${OPENALEX_KEY}`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.results || []).map(p => {
      let abstract = '';
      if (p.abstract_inverted_index) {
        const words = [];
        Object.entries(p.abstract_inverted_index).forEach(([w, pos]) => { pos.forEach(i => { words[i] = w; }); });
        abstract = words.filter(Boolean).join(' ').slice(0, 500);
      }
      return {
        doi: p.doi ? p.doi.replace('https://doi.org/', '') : '',
        title: p.title || '',
        authors: (p.authorships || []).slice(0, 5).map(a => a.author?.display_name || '').filter(Boolean).join(', '),
        abstract, date: p.publication_date || '',
        server: p.primary_location?.source?.display_name || 'OpenAlex',
        source: 'openalex', isOpenAccess: p.open_access?.is_oa || false,
        citedCount: p.cited_by_count || 0,
        institutions: (p.authorships || []).map(a => a.institutions?.[0]?.display_name).filter(Boolean),
        countries: (p.authorships || []).map(a => a.institutions?.[0]?.country_code).filter(Boolean),
      };
    });
  } catch { return []; }
}

async function fetchDOAJ(terms) {
  try {
    const url = `${SOURCES.doaj}/${encodeURIComponent(terms)}?pageSize=10&sort=created_date:desc`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.results || []).map(p => {
      const bib = p.bibjson || {};
      return {
        doi: (bib.identifier || []).find(i => i.type === 'doi')?.id || '',
        title: bib.title || '',
        authors: (bib.author || []).map(a => a.name).join(', '),
        abstract: (bib.abstract || '').slice(0, 500),
        date: bib.year ? `${bib.year}-01-01` : '',
        server: bib.journal?.title || 'DOAJ', source: 'doaj', isOpenAccess: true,
      };
    });
  } catch { return []; }
}

async function fetchPubMed(terms, periodDays) {
  try {
    const searchUrl = `${SOURCES.pubmed_search}?db=pubmed&term=${encodeURIComponent(terms)}&retmax=15&sort=date&retmode=json&datetype=pdat&reldate=${periodDays}`;
    const searchResp = await fetchSafe(searchUrl);
    if (!searchResp?.ok) return [];
    const searchData = await searchResp.json();
    const ids = searchData?.esearchresult?.idlist;
    if (!ids?.length) return [];

    const detailUrl = `${SOURCES.pubmed_detail}?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const detailResp = await fetchSafe(detailUrl);
    if (!detailResp?.ok) return [];
    const detailData = await detailResp.json();
    const result = detailData?.result;
    if (!result) return [];

    return ids.map(id => {
      const p = result[id];
      if (!p?.title) return null;
      return {
        doi: (p.elocationid || '').replace('doi: ', ''),
        title: p.title, authors: (p.authors || []).map(a => a.name).join(', '),
        abstract: '', date: p.pubdate || '',
        server: p.fulljournalname || 'PubMed', source: 'pubmed',
      };
    }).filter(Boolean);
  } catch { return []; }
}

async function fetchArxiv(catQuery) {
  try {
    const url = `${SOURCES.arxiv}?search_query=${encodeURIComponent(catQuery)}&sortBy=submittedDate&sortOrder=descending&max_results=15`;
    const resp = await fetchSafe(url);
    if (!resp?.ok) return [];
    const text = await resp.text();
    const entries = text.split('<entry>').slice(1);
    return entries.map(e => {
      const tag = (t) => { const m = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : ''; };
      const authors = [...e.matchAll(/<author><name>([^<]+)<\/name>/g)].map(m => m[1]).slice(0, 5);
      const id = tag('id');
      return {
        doi: id.includes('arxiv.org') ? id.replace('http://arxiv.org/abs/', '') : '',
        title: tag('title').replace(/\s+/g, ' '),
        authors: authors.join(', '),
        abstract: tag('summary').replace(/\s+/g, ' ').slice(0, 500),
        date: tag('published').split('T')[0],
        server: 'arXiv', source: 'arxiv',
        link: id.replace('/abs/', '/pdf/'),
      };
    });
  } catch { return []; }
}

// ═══════════ CORE (core.ac.uk) — 136M+ open access articles ═══════════

async function fetchCORE(terms) {
  if (!CORE_API_KEY) return [];
  try {
    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(terms)}&limit=20&apiKey=${CORE_API_KEY}`;
    const resp = await fetchSafe(url, 12000);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.results || []).map(p => ({
      doi: p.doi || '',
      title: p.title || '',
      authors: (p.authors || []).map(a => typeof a === 'string' ? a : (a.name || '')).join(', '),
      abstract: (p.abstract || '').slice(0, 500),
      date: p.publishedDate || (p.yearPublished ? `${p.yearPublished}-01-01` : ''),
      server: p.publisher || (p.journals && p.journals[0]?.title) || 'CORE',
      source: 'core',
      isOpenAccess: true,
      link: p.downloadUrl || (p.sourceFulltextUrls && p.sourceFulltextUrls[0]) || '',
    }));
  } catch(e) { console.warn('CORE fetch failed:', e); return []; }
}

// ═══════════ Springer Nature Open Access — free API key ═══════════

async function fetchSpringerOA(terms, periodDays) {
  if (!SPRINGER_API_KEY) return [];
  try {
    const url = `https://api.springernature.com/openaccess/json?q=${encodeURIComponent(terms)}&openaccess=true&s=1&p=15&api_key=${SPRINGER_API_KEY}`;
    const resp = await fetchSafe(url, 12000);
    if (!resp?.ok) return [];
    const data = await resp.json();
    return (data.records || []).map(p => ({
      doi: p.doi || '',
      title: p.title || '',
      authors: (p.creators || []).map(a => a.creator).join(', '),
      abstract: (p.abstract || '').replace(/<[^>]*>/g, '').slice(0, 500),
      date: p.publicationDate || '',
      server: p.publicationName || 'Springer Nature',
      source: 'springer',
      isOpenAccess: true,
      link: (p.url || []).find(u => u.format === 'pdf')?.value || '',
    }));
  } catch(e) { console.warn('Springer OA fetch failed:', e); return []; }
}

// ═══════════ Unpaywall — enrich DOIs with open access PDF links ═══════════

async function enrichWithUnpaywall(papers) {
  const enrichable = papers.filter(p => p.doi && !p.isOpenAccess && !p.link);
  if (enrichable.length === 0) return papers;

  const toEnrich = enrichable.slice(0, 10);
  const results = await Promise.allSettled(
    toEnrich.map(async (p) => {
      try {
        const resp = await fetchSafe(`https://api.unpaywall.org/v2/${p.doi}?email=${OPENALEX_KEY}`, 5000);
        if (!resp?.ok) return null;
        const data = await resp.json();
        return {
          doi: p.doi,
          isOpenAccess: data.is_oa || false,
          link: data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || '',
        };
      } catch { return null; }
    })
  );

  const enrichMap = {};
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) enrichMap[r.value.doi] = r.value;
  });

  return papers.map(p => {
    const e = enrichMap[p.doi];
    return e ? { ...p, isOpenAccess: e.isOpenAccess || p.isOpenAccess, link: e.link || p.link } : p;
  });
}

// ═══════════ DEDUPLICATION ═══════════

function deduplicateByDOI(papers) {
  const seen = new Set();
  return papers.filter(p => {
    if (!p.doi) return true;
    const key = p.doi.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════ MAIN HANDLER ═══════════

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    query = '',           // search terms
    terms = '',           // alternative search terms
    periodDays = 7,       // 1, 3, 7, 30
    domains = [],         // user domains for conditional sources
    arxivCategories = '', // arXiv category query
    enableBiorxiv = true,
    enableArxiv = false,
  } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || req.query);

  const searchTerms = query || terms || 'biology';
  const period = parseInt(periodDays) || 7;
  const start = getDateStr(-period);
  const end = getDateStr(0);

  try {
    // Launch all fetches in parallel
    const fetches = [
      fetchEuropePMC(searchTerms),
      fetchSemantic(searchTerms),
      fetchCrossref(searchTerms, period),
      fetchOpenAlex(searchTerms, period),
      fetchDOAJ(searchTerms),
      fetchPubMed(searchTerms, period),
      fetchCORE(searchTerms),
      fetchSpringerOA(searchTerms, period),
    ];

    if (enableBiorxiv) {
      fetches.push(fetchBiorxiv(start, end));
      fetches.push(fetchMedrxiv(start, end));
    }
    if (enableArxiv && arxivCategories) {
      fetches.push(fetchArxiv(arxivCategories));
    }

    const results = await Promise.allSettled(fetches);

    // Collect source counts
    const sourceNames = ['europepmc', 'semantic', 'crossref', 'openalex', 'doaj', 'pubmed', 'core', 'springer'];
    if (enableBiorxiv) sourceNames.push('biorxiv', 'medrxiv');
    if (enableArxiv) sourceNames.push('arxiv');

    const sourceCounts = {};
    let allPapers = [];

    results.forEach((r, i) => {
      const name = sourceNames[i] || `source_${i}`;
      if (r.status === 'fulfilled' && r.value) {
        sourceCounts[name] = r.value.length;
        allPapers = allPapers.concat(r.value);
      } else {
        sourceCounts[name] = 0;
      }
    });

    // Deduplicate
    allPapers = deduplicateByDOI(allPapers);

    // Enrich with Unpaywall (adds OA PDF links to closed-access papers)
    allPapers = await enrichWithUnpaywall(allPapers);

    // Sort by date descending
    allPapers.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.status(200).json({
      success: true,
      total: allPapers.length,
      sourceCounts,
      papers: allPapers,
      period: { days: period, start, end },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
