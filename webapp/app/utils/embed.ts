/**
 * Server-side embedding providers (OpenAI by default).
 * Do not import from client components.
 */

import 'server-only';

export type EmbedProvider = 'ollama' | 'openai' | 'huggingface';

function l2Normalize(vec: number[] | Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export interface EmbedConfig {
  provider: EmbedProvider;
  model: string;
  dimensions: number;
  baseUrl?: string;
}

export function getEmbedConfig(manifest?: {
  model?: string;
  dimensions?: number;
  provider?: string;
}): EmbedConfig {
  let provider = (
    process.env.EMBEDDING_PROVIDER ||
    manifest?.provider ||
    'openai'
  ).toLowerCase();

  // Gemini is not supported — fall back to OpenAI
  if (provider === 'gemini' || provider === 'google') {
    console.warn(
      `EMBEDDING_PROVIDER="${provider}" is not supported; using openai`
    );
    provider = 'openai';
  }

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model:
        manifest?.model ||
        process.env.OPENAI_EMBED_MODEL ||
        'text-embedding-3-small',
      dimensions: Number(
        manifest?.dimensions || process.env.EMBEDDING_DIMENSIONS || 512
      ),
    };
  }

  if (provider === 'huggingface') {
    return {
      provider: 'huggingface',
      model:
        manifest?.model ||
        process.env.HF_EMBED_MODEL ||
        'sentence-transformers/all-MiniLM-L6-v2',
      dimensions: Number(
        manifest?.dimensions || process.env.EMBEDDING_DIMENSIONS || 384
      ),
    };
  }

  return {
    provider: 'ollama',
    model:
      manifest?.model || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    dimensions: Number(
      manifest?.dimensions || process.env.EMBEDDING_DIMENSIONS || 768
    ),
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(
      /\/$/,
      ''
    ),
  };
}

function meanPool(matrix: unknown): Float32Array | null {
  if (!Array.isArray(matrix) || matrix.length === 0) return null;
  if (typeof matrix[0] === 'number') {
    return l2Normalize(matrix as number[]);
  }
  const rows = matrix as number[][];
  const dims = rows[0].length;
  const mean = new Float32Array(dims);
  for (const row of rows) {
    for (let d = 0; d < dims; d++) mean[d] += row[d];
  }
  for (let d = 0; d < dims; d++) mean[d] /= rows.length;
  return l2Normalize(mean);
}

async function embedOpenAI(
  text: string,
  config: EmbedConfig
): Promise<Float32Array | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: text.slice(0, 8000),
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    console.error('OpenAI query embedding failed:', await response.text());
    return null;
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding as number[] | undefined;
  if (!embedding) return null;
  return l2Normalize(embedding);
}

async function embedOllama(
  text: string,
  config: EmbedConfig
): Promise<Float32Array | null> {
  try {
    const response = await fetch(`${config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      console.error('Ollama query embedding failed:', await response.text());
      return null;
    }

    const data = await response.json();
    if (!data.embedding) return null;
    return l2Normalize(data.embedding as number[]);
  } catch (err) {
    console.error('Ollama query embedding error:', err);
    return null;
  }
}

async function embedHuggingFace(
  text: string,
  config: EmbedConfig
): Promise<Float32Array | null> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;

  try {
    const url = `https://router.huggingface.co/hf-inference/models/${config.model}/pipeline/feature-extraction`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text.slice(0, 8000),
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      console.error('HF query embedding failed:', await response.text());
      return null;
    }

    return meanPool(await response.json());
  } catch (err) {
    console.error('HF query embedding error:', err);
    return null;
  }
}

/**
 * Embed a search query using the configured provider (OpenAI by default).
 */
export async function embedQueryText(
  text: string,
  manifest?: { model?: string; dimensions?: number; provider?: string }
): Promise<Float32Array | null> {
  const config = getEmbedConfig(manifest);

  if (config.provider === 'openai') return embedOpenAI(text, config);
  if (config.provider === 'huggingface') return embedHuggingFace(text, config);
  return embedOllama(text, config);
}

export function canEmbedQueries(
  manifest?: { provider?: string }
): boolean {
  const config = getEmbedConfig(manifest);
  if (config.provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (config.provider === 'huggingface') {
    return Boolean(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY);
  }
  // Ollama: assume available; failed calls degrade gracefully
  return true;
}
