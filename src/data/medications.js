export const medications = [
  {
    id: 'dipirona-1g-2ml',
    name: 'Dipirona Sódica',
    variation: '1 g / 2 mL',
    volumeMl: 2,
    amountMg: 1000,
    mgPerKgDefault: 15,
    description:
      'Analgésico e antipirético utilizado para dor aguda, cólica e controle de febre.',
    indications: ['Dor aguda', 'Febre', 'Cólica'],
    image: '/images/ampola.svg'
  },
  {
    id: 'dipirona-500mg-ml',
    name: 'Dipirona Sódica',
    variation: '500 mg / 1 mL',
    volumeMl: 1,
    amountMg: 500,
    mgPerKgDefault: 15,
    description:
      'Mesma substância ativa com concentração diferente, indicada quando se deseja menor volume.',
    indications: ['Dor moderada', 'Febre', 'Ajuste fino de dose'],
    image: '/images/ampola.svg'
  },
  {
    id: 'morfina-10mg-ml',
    name: 'Morfina',
    variation: '10 mg / 1 mL',
    volumeMl: 1,
    amountMg: 10,
    mgPerKgDefault: 0.1,
    description:
      'Opioide para dor intensa em ambiente hospitalar, com monitoramento clínico.',
    indications: ['Dor intensa', 'Dor pós-operatória'],
    image: '/images/ampola.svg'
  },
  {
    id: 'furosemida-20mg-2ml',
    name: 'Furosemida',
    variation: '20 mg / 2 mL',
    volumeMl: 2,
    amountMg: 20,
    mgPerKgDefault: 1,
    description:
      'Diurético de alça utilizado em edema e suporte em situações de sobrecarga hídrica.',
    indications: ['Edema', 'Insuficiência cardíaca', 'Hipertensão em urgência'],
    image: '/images/ampola.svg'
  },
  {
    id: 'ceftriaxona-1g-10ml',
    name: 'Ceftriaxona',
    variation: '1 g / 10 mL',
    volumeMl: 10,
    amountMg: 1000,
    mgPerKgDefault: 50,
    description:
      'Antibiótico de amplo espectro frequentemente utilizado em infecções graves.',
    indications: ['Pneumonia', 'Meningite', 'Infecções sistêmicas'],
    image: '/images/ampola.svg'
  },
  {
    id: 'hidrocortisona-100mg-2ml',
    name: 'Hidrocortisona',
    variation: '100 mg / 2 mL',
    volumeMl: 2,
    amountMg: 100,
    mgPerKgDefault: 2,
    description:
      'Corticoide para resposta anti-inflamatória e em protocolos de emergência.',
    indications: ['Reação alérgica', 'Broncoespasmo', 'Choque'],
    image: '/images/ampola.svg'
  }
]
