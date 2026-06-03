/**
 * Crea o actualiza la encuesta CSAT "SFOC CSAT" en PostHog EU.
 *
 * Flujo:
 *   1. Rating 1–5 (obligatorio)
 *   2. Puerta sí/no — si "No", fin; si "Sí", bloque opcional
 *   3–8. Seis preguntas opcionales (saltables)
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   node scripts/createPosthogCsatSurvey.mjs          # crear si no existe
 *   node scripts/createPosthogCsatSurvey.mjs --update # actualizar existente
 */
const API_HOST = 'https://eu.posthog.com';
const SURVEY_ID = '019e8ce8-6bb9-0000-6c3b-a5e878a9aa6c';
const UPDATE = process.argv.includes('--update');
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

/** Índice de la primera pregunta opcional (tras rating + puerta). */
const OPTIONAL_BLOCK_START_INDEX = 2;

const FEATURE_CHOICES = {
  es: [
    'Comparar orgs',
    'Diff de metadata',
    'Tests Apex',
    'Cobertura Apex',
    'Editor rápido (Quick Edit)',
    'Apex anónimo',
    'Analizador de permisos',
    'Logs de depuración',
    'No estoy seguro'
  ],
  en: [
    'Compare orgs',
    'Metadata diff',
    'Apex tests',
    'Apex coverage',
    'Quick Edit',
    'Anonymous Apex',
    'Permission analyzer',
    'Debug logs',
    'Not sure'
  ]
};

const IMPROVE_ONE_CHOICES = {
  es: [
    'Más tipos de metadata',
    'Mejor diff / comparación',
    'Más velocidad',
    'Mejor tests y cobertura Apex',
    'Mejor analizador de permisos',
    'Mejor documentación / onboarding',
    'Otra'
  ],
  en: [
    'More metadata types',
    'Better diff / comparison',
    'More speed',
    'Better Apex tests and coverage',
    'Better permission analyzer',
    'Better docs / onboarding',
    'Other'
  ]
};

const GATE_CHOICES = {
  es: ['Sí, continuar', 'No, enviar feedback'],
  en: ['Yes, continue', 'No, submit feedback']
};

const OPTIONAL_SKIP_HINT = {
  es: 'Puedes saltar cualquier pregunta o enviar cuando quieras.',
  en: 'You can skip any question or submit whenever you like.'
};

if (!PERSONAL_KEY.startsWith('phx_')) {
  console.error(
    'Falta POSTHOG_PERSONAL_API_KEY (phx_...). Créala en PostHog EU → Settings → Personal API keys.'
  );
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_HOST}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PERSONAL_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function resolveProjectId() {
  if (process.env.POSTHOG_PROJECT_ID) {
    return String(process.env.POSTHOG_PROJECT_ID);
  }
  const data = await api('/api/projects/');
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 1) return String(results[0].id);
  if (results.length > 1) {
    console.log('Proyectos disponibles:');
    for (const p of results) {
      console.log(`  - ${p.id}: ${p.name}`);
    }
    throw new Error('Varios proyectos: define POSTHOG_PROJECT_ID');
  }
  throw new Error('No se encontró ningún proyecto PostHog');
}

/**
 * Ramificación puerta: índice 0 → bloque opcional; índice 1 → fin.
 * posthog-js usa índices de choice en responseValues, no el texto traducido.
 */
function gateBranching() {
  return {
    type: 'response_based',
    responseValues: {
      0: OPTIONAL_BLOCK_START_INDEX,
      1: 'end'
    }
  };
}

function buildSurveyPayload() {
  const confusingChoices = [...FEATURE_CHOICES.es, 'Otra'];
  const confusingChoicesEn = [...FEATURE_CHOICES.en, 'Other'];

  return {
    name: 'SFOC CSAT',
    description:
      'Encuesta de satisfacción para usuarios de la extensión Salesforce Org Compare (Chrome).',
    type: 'popover',
    base_language: 'es',
    enable_partial_responses: true,
    questions: [
      {
        type: 'rating',
        scale: 5,
        display: 'number',
        question: '¿Qué tan útil te resulta Salesforce Org Compare?',
        description: 'Del 1 (poco útil) al 5 (muy útil).',
        lowerBoundLabel: 'Poco útil',
        upperBoundLabel: 'Muy útil',
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'How useful is Salesforce Org Compare for you?',
            description: 'From 1 (not useful) to 5 (very useful).',
            lowerBoundLabel: 'Not useful',
            upperBoundLabel: 'Very useful',
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'single_choice',
        question: '¿Te apetece responder unas preguntas más?',
        description:
          'Son opcionales y nos ayudan a priorizar mejoras (~1 min). Si eliges no, enviamos solo tu valoración.',
        choices: GATE_CHOICES.es,
        shuffleOptions: false,
        buttonText: 'Siguiente',
        branching: gateBranching(),
        translations: {
          en: {
            question: 'Would you like to answer a few more questions?',
            description:
              'They are optional and help us prioritize improvements (~1 min). If you choose no, we only submit your rating.',
            choices: GATE_CHOICES.en,
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'multiple_choice',
        question: '¿Qué funciones has usado en los últimos 30 días?',
        description: OPTIONAL_SKIP_HINT.es,
        choices: FEATURE_CHOICES.es,
        optional: true,
        shuffleOptions: false,
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'Which features have you used in the last 30 days?',
            description: OPTIONAL_SKIP_HINT.en,
            choices: FEATURE_CHOICES.en,
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'single_choice',
        question: '¿Cuál es la función que más valoras?',
        description: OPTIONAL_SKIP_HINT.es,
        choices: FEATURE_CHOICES.es,
        optional: true,
        shuffleOptions: false,
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'Which feature do you value the most?',
            description: OPTIONAL_SKIP_HINT.en,
            choices: FEATURE_CHOICES.en,
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'single_choice',
        question: '¿Qué función te resulta más confusa o lenta?',
        description: OPTIONAL_SKIP_HINT.es,
        choices: confusingChoices,
        optional: true,
        shuffleOptions: false,
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'Which feature feels most confusing or slow?',
            description: OPTIONAL_SKIP_HINT.en,
            choices: confusingChoicesEn,
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'single_choice',
        question: 'Si mejoráramos una sola cosa el próximo trimestre, ¿cuál elegirías?',
        description: OPTIONAL_SKIP_HINT.es,
        choices: IMPROVE_ONE_CHOICES.es,
        optional: true,
        shuffleOptions: false,
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'If we could improve one thing next quarter, what would you pick?',
            description: OPTIONAL_SKIP_HINT.en,
            choices: IMPROVE_ONE_CHOICES.en,
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'rating',
        scale: 5,
        display: 'number',
        question: '¿Qué tan fácil fue empezar a usar la extensión?',
        description: OPTIONAL_SKIP_HINT.es,
        lowerBoundLabel: 'Muy difícil',
        upperBoundLabel: 'Muy fácil',
        optional: true,
        buttonText: 'Siguiente',
        translations: {
          en: {
            question: 'How easy was it to get started with the extension?',
            description: OPTIONAL_SKIP_HINT.en,
            lowerBoundLabel: 'Very difficult',
            upperBoundLabel: 'Very easy',
            buttonText: 'Next'
          }
        }
      },
      {
        type: 'open',
        question: '¿Qué mejorarías de la extensión?',
        description: 'Ideas, funciones que echas en falta o fricciones que hayas notado.',
        optional: true,
        buttonText: 'Enviar',
        translations: {
          en: {
            question: 'What would you improve about the extension?',
            description: 'Ideas, missing features, or friction you have noticed.',
            buttonText: 'Submit'
          }
        }
      }
    ],
    /** Sin disparo por evento: la extensión lanza la encuesta tras N comparison_run. */
    conditions: {
      seenSurveyWaitPeriodInDays: 7
    },
    appearance: {
      thankYouMessageHeader: '¡Gracias!',
      thankYouMessageDescription: 'Tu feedback nos ayuda a mejorar la extensión.',
      submitButtonText: 'Enviar',
      displayThankYouMessage: true,
      position: 'right',
      whiteLabel: false
    },
    translations: {
      en: {
        thankYouMessageHeader: 'Thank you!',
        thankYouMessageDescription: 'Your feedback helps us improve the extension.'
      }
    }
  };
}

async function main() {
  const projectId = await resolveProjectId();
  const payload = buildSurveyPayload();

  if (UPDATE) {
    const updated = await api(`/api/projects/${projectId}/surveys/${SURVEY_ID}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    console.log('Encuesta actualizada.');
    console.log(`  id:        ${updated.id}`);
    console.log(`  preguntas: ${updated.questions?.length ?? '?'}`);
    console.log(`  URL:       ${API_HOST}/surveys/${updated.id}`);
    return;
  }

  const existing = await api(`/api/projects/${projectId}/surveys/?search=SFOC%20CSAT`);
  const found = (existing?.results || []).find((s) => s.name === 'SFOC CSAT' && !s.archived);
  if (found) {
    console.log(`La encuesta ya existe (id=${found.id}). Usa --update para actualizar.`);
    console.log(`URL: ${API_HOST}/surveys/${found.id}`);
    return;
  }

  const created = await api(`/api/projects/${projectId}/surveys/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log('Encuesta creada correctamente.');
  console.log(`  id:   ${created.id}`);
  console.log(`  URL:  ${API_HOST}/surveys/${created.id}`);
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
