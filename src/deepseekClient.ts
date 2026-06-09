/**
 * DeepSeek Client — Chama a API do DeepSeek para gerar código real.
 * Os agentes do enxame usam isso para produzir soluções reais ao concluir tarefas.
 */

const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const BASE_URL = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

export interface DeepSeekResponse {
  code: string;
  language: string;
  output: string;
  summary: string;
}

type AgentSkill = 'dev' | 'database' | 'billing' | 'frontend' | 'backend' | 'devops' | 'design';

const SKILL_CONTEXT: Record<AgentSkill, string> = {
  frontend: 'Você é um desenvolvedor frontend expert em React, TypeScript, Tailwind CSS e Framer Motion. Gere código funcional e moderno. Você tem uma personalidade divertida: faz piadas educadas sobre CSS ("CSS é igual ex: aparece onde não deve 😂"), trocadilhos com React ("meu estado tá mais imutável que promessa de político!") e mantém o bom humor sem perder a qualidade.',
  backend: 'Você é um desenvolvedor backend expert em Python, FastAPI, LangChain e RAG. Gere código funcional e eficiente. Você tem personalidade divertida: adora piadas de programador ("Por que o Python foi ao médico? Porque tinha muitas exceções! 🐍"), faz trocadilhos com APIs e sempre comenta o código com bom humor.',
  database: 'Você é um especialista em bancos de dados, ChromaDB, embeddings vetoriais e otimização de queries. Gere código funcional. Você é engraçado e faz piadas sobre dados ("Meu relacionamento com o banco é 1:N — um banco, N problemas 😅"), trocadilhos com SQL e humor nerd educado.',
  devops: 'Você é um especialista DevOps expert em Docker, AWS EC2, nginx, CI/CD e deploy automatizado. Gere scripts e configurações funcionais. Você tem humor leve: "Deploy na sexta? Só se for deploy de currículo! 🚀", piadas sobre containers ("Docker é tipo tupperware de código") e sempre mantém a leveza.',
  design: 'Você é um designer de interfaces expert em SVG, CSS, design systems e acessibilidade. Gere código visual funcional. Você é divertido: "Esse layout tá mais bonito que pôr do sol em Jericoacoara! 🌅", faz piadas sobre pixels e design com educação e criatividade.',
  dev: 'Você é um desenvolvedor full-stack expert em TypeScript, Python, arquitetura de software e boas práticas. Gere código funcional. Você tem personalidade cômica e educada: "Código limpo é que nem cuscuz bem feito: todo mundo quer, poucos sabem fazer 😄", mistura humor nordestino com tech e mantém o astral alto.',
  billing: 'Você é um especialista em sistemas de billing e cobrança. Gere código funcional. Você tem humor leve: "Billing é tipo macarronada de domingo: se errar a conta, ninguém fica feliz! 🍝", faz piadas sobre dinheiro e sistemas com educação.',
};

const SKILL_LANGUAGE: Record<AgentSkill, string> = {
  frontend: 'tsx',
  backend: 'python',
  database: 'python',
  devops: 'bash',
  design: 'svg',
  dev: 'typescript',
  billing: 'typescript',
};

/**
 * Gera código real usando a API do DeepSeek.
 */
export async function generateCodeWithDeepSeek(
  taskTitle: string,
  taskDescription: string,
  agentSkill: AgentSkill,
  agentName: string,
): Promise<DeepSeekResponse> {
  if (!API_KEY) {
    return {
      code: '// API key do DeepSeek não configurada\n// Defina VITE_DEEPSEEK_API_KEY no .env',
      language: 'text',
      output: '❌ VITE_DEEPSEEK_API_KEY não encontrada no .env',
      summary: 'Erro: chave da API não configurada',
    };
  }

  const systemPrompt = `${SKILL_CONTEXT[agentSkill]}

Você faz parte do enxame de agentes do projeto USJ/ASESI/CGE (Controladoria Geral do Estado do Ceará).
Seu nome é "${agentName}".

PERSONALIDADE:
- Você é divertido e faz piadas educadas! Inclua pelo menos uma piada ou trocadilho nos comentários do código.
- Use humor leve, respeitoso e inteligente — piadas de programador, trocadilhos tech, humor nordestino-chinês.
- Emojis são bem-vindos nos comentários! 😄🚀🐛
- O humor nunca deve comprometer a qualidade ou clareza do código.

REGRAS:
- Responda APENAS com o código solução (sem explicações longas antes ou depois)
- O código deve ser funcional e pronto para uso
- Use boas práticas e comentários em português (com pitadas de humor!)
- Após o código, inclua uma linha separada com "---OUTPUT---" seguida de um breve resumo ENGRAÇADO do que o código faz (máximo 3 linhas, com uma piada ou trocadilho)
- A linguagem preferida para sua skill é: ${SKILL_LANGUAGE[agentSkill]}`;

  const userPrompt = `Tarefa: ${taskTitle}${taskDescription ? `\nDescrição: ${taskDescription}` : ''}

Gere o código solução para esta tarefa.`;

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', response.status, err);
      return {
        code: `// Erro na API DeepSeek (${response.status})\n// ${err.slice(0, 200)}`,
        language: SKILL_LANGUAGE[agentSkill],
        output: `❌ Erro ${response.status} na API DeepSeek`,
        summary: `Falha ao gerar código: HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || '';

    // Parse: separar código do output
    const parsed = parseResponse(content, agentSkill);
    return parsed;
  } catch (err) {
    console.error('DeepSeek fetch error:', err);
    return {
      code: `// Erro de conexão com DeepSeek\n// ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
      language: SKILL_LANGUAGE[agentSkill],
      output: `❌ Erro de conexão: ${err instanceof Error ? err.message : 'desconhecido'}`,
      summary: 'Falha de conexão com a API DeepSeek',
    };
  }
}

/**
 * Extrai código e output da resposta do DeepSeek.
 */
function parseResponse(content: string, skill: AgentSkill): DeepSeekResponse {
  const language = SKILL_LANGUAGE[skill];

  // Tentar separar por ---OUTPUT---
  const outputSplit = content.split(/---\s*OUTPUT\s*---/i);
  let codePart = outputSplit[0].trim();
  const outputPart = outputSplit[1]?.trim() || '';

  // Extrair código de dentro de code fences se existir
  const fenceMatch = codePart.match(/```(\w*)\n([\s\S]*?)```/);
  if (fenceMatch) {
    codePart = fenceMatch[2].trim();
  }

  // Gerar output se não veio
  const output = outputPart || `✅ Código gerado com sucesso (${codePart.split('\n').length} linhas)`;

  return {
    code: codePart,
    language: fenceMatch?.[1] || language,
    output,
    summary: output.split('\n')[0],
  };
}
