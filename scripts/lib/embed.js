/**
 * Embedding helpers for RAG build + query.
 *
 * Providers:
 *   - openai (default) — requires OPENAI_API_KEY
 *   - ollama (free local) — requires Ollama + `ollama pull nomic-embed-text`
 *   - huggingface (free cloud tier) — requires HF_TOKEN
 */

function getEmbedConfig() {
  let provider = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();

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
      model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 512),
      batchSize: 64,
    };
  }

  if (provider === 'huggingface' || provider === 'hf') {
    return {
      provider: 'huggingface',
      model:
        process.env.HF_EMBED_MODEL ||
        'sentence-transformers/all-MiniLM-L6-v2',
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 384),
      batchSize: 8,
    };
  }

  return {
    provider: 'ollama',
    model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 768),
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(
      /\/$/,
      ''
    ),
    batchSize: 1,
  };
}

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(vec, (v) => v / norm);
}

function meanPool(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return null;
  if (typeof matrix[0] === 'number') return l2Normalize(matrix);
  const dims = matrix[0].length;
  const mean = new Float32Array(dims);
  for (const row of matrix) {
    for (let d = 0; d < dims; d++) mean[d] += row[d];
  }
  for (let d = 0; d < dims; d++) mean[d] /= matrix.length;
  return l2Normalize(mean);
}

async function embedOpenAI(texts, config) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for openai provider');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings failed (${response.status}): ${await response.text()}`
    );
  }

  const data = await response.json();
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => l2Normalize(item.embedding));
}

async function embedOllamaOne(text, config) {
  const response = await fetch(`${config.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Ollama embeddings failed (${response.status}): ${errText}\n` +
        `Is Ollama running? Try: ollama pull ${config.model}`
    );
  }

  const data = await response.json();
  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Ollama response missing embedding array');
  }
  return l2Normalize(data.embedding);
}

async function embedOllama(texts, config) {
  const out = [];
  for (const text of texts) {
    out.push(await embedOllamaOne(text, config));
  }
  return out;
}

async function embedHuggingFaceOne(text, config) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    throw new Error('HF_TOKEN is required for huggingface provider');
  }

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
    throw new Error(
      `Hugging Face embeddings failed (${response.status}): ${await response.text()}`
    );
  }

  const data = await response.json();
  const vec = meanPool(data);
  if (!vec) throw new Error('Unexpected Hugging Face embedding shape');
  return vec;
}

async function embedHuggingFace(texts, config) {
  const out = [];
  for (const text of texts) {
    out.push(await embedHuggingFaceOne(text, config));
  }
  return out;
}

async function embedTexts(texts, config = getEmbedConfig()) {
  if (config.provider === 'openai') return embedOpenAI(texts, config);
  if (config.provider === 'huggingface') return embedHuggingFace(texts, config);
  return embedOllama(texts, config);
}

async function embedOne(text, config = getEmbedConfig()) {
  const [vec] = await embedTexts([text], config);
  return vec;
}

module.exports = {
  getEmbedConfig,
  embedTexts,
  embedOne,
  l2Normalize,
};
