/* TrooCRO site settings. The analyzer API is a free-plan Supabase Edge Function. */
window.TROOCRO_CONFIG = {
  api: "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-site-analysis",
  pageView: "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-page-view",
  growth: "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troogrowth",
  /* Google PageSpeed Insights key (free, internal project). Restrict it to purrieie.github.io in Google Cloud. */
  psiKey: "AIzaSyC4k7vaxwnNf_CkV_URwKRLls2A3xV1Tfk",
  /* v3 engine-faithful API: the local dev server, or the live troocro-analyze function (same handler as v2.1) */
  v3: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin + "/api" : "https://mrfixorpmhrnkxhqzesn.supabase.co/functions/v1/troocro-analyze",
  whatsapp: "919810483552",
  caseStudies: "https://troopod.io/case-studies"
};
