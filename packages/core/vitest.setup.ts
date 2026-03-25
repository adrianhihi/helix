const savedKeys: Record<string, string | undefined> = {};
const keysToClean = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'HELIX_LLM_API_KEY'];

beforeAll(() => {
  for (const key of keysToClean) {
    savedKeys[key] = process.env[key];
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of keysToClean) {
    if (savedKeys[key]) process.env[key] = savedKeys[key];
    else delete process.env[key];
  }
});
