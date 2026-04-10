# Calculadora HUSM

Webapp em Vue + Vite para apoio ao cálculo de dosagem médica por regra de três.

## Funcionalidades

- Busca de medicamentos com variações de diluição
- Exibição de descrição, indicações e imagem da ampola
- Cálculo padrão por quantidade prescrita (mg)
- Cálculo por peso (mg/kg x kg do paciente)
- Histórico de pesquisas recentes salvo no navegador
- Cadastro de novos medicamentos na área de administração (perfil admin)
- Edição e remoção de medicamentos cadastrados pelo admin
- Layout responsivo para desktop e mobile

## Status da fonte de dados

A implementação atual é provisória para fins de visualização e validação de funcionamento.

- Base inicial: mock local em `src/data/medications.js`
- Cadastros administrativos: persistidos no navegador via `localStorage`
- Evolução prevista: integração com backend e banco de dados

## Como executar

1. Instale as dependências:

```bash
npm install
```

1. Rode em desenvolvimento:

```bash
npm run dev
```

1. Build de produção:

```bash
npm run build
```

1. Visualizar build local:

```bash
npm run preview
```

## Estrutura principal

- `src/App.vue`: login, busca, calculadora e área administrativa
- `src/data/medications.js`: base local de medicamentos
- `src/style.css`: estilos globais e classes reutilizáveis