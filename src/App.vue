<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { medications as baseMedications } from './data/medications'

const AUTH_KEY = 'husm-auth'
const RECENT_KEY = 'husm-recent-searches'
const CUSTOM_MEDICATIONS_KEY = 'husm-custom-medications'
const DEFAULT_IMAGE = '/images/ampola.svg'

const loginUser = ref('')
const loginPassword = ref('')
const loginError = ref('')
const authUser = ref('')
const authRole = ref('')
const isAuthenticated = ref(false)
const activeView = ref('calculator')

const searchTerm = ref('')
const selectedMedication = ref(null)
const recentSearches = ref([])
const customMedications = ref([])

const calculateByWeight = ref(false)
const prescribedMg = ref('')
const mgPerKg = ref('')
const patientWeight = ref('')
const resultMl = ref('')
const calcError = ref('')

const adminError = ref('')
const adminSuccess = ref('')
const editingMedicationId = ref('')
const newMedication = reactive({
  name: '',
  variation: '',
  volumeMl: '',
  amountMg: '',
  mgPerKgDefault: '',
  description: '',
  indications: '',
  image: ''
})

const normalizeText = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const slugify = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'medicamento'

const medicationLabel = (medication) =>
  `${medication.name} - ${medication.variation}`

const canManage = computed(() => authRole.value === 'admin')
const isEditingMedication = computed(() => Boolean(editingMedicationId.value))

const dataSourceStatus =
  'Modo provisório: medicamentos e cadastros salvos localmente (mock + localStorage).'

const allMedications = computed(() => [
  ...baseMedications,
  ...customMedications.value
])

const filteredMedications = computed(() => {
  const query = normalizeText(searchTerm.value.trim())

  if (!query) {
    return allMedications.value
  }

  return allMedications.value.filter((medication) => {
    const searchableText = normalizeText(
      [
        medication.name,
        medication.variation,
        medication.description,
        medication.indications.join(' ')
      ].join(' ')
    )

    return searchableText.includes(query)
  })
})

const roleLabel = computed(() =>
  authRole.value === 'admin' ? 'Administrador' : 'Profissional'
)

const loadRecentSearches = () => {
  const rawHistory = localStorage.getItem(RECENT_KEY)

  if (!rawHistory) {
    recentSearches.value = []
    return
  }

  try {
    const parsed = JSON.parse(rawHistory)
    recentSearches.value = Array.isArray(parsed) ? parsed.slice(0, 8) : []
  } catch {
    recentSearches.value = []
  }
}

const loadCustomMedications = () => {
  const rawCustom = localStorage.getItem(CUSTOM_MEDICATIONS_KEY)

  if (!rawCustom) {
    customMedications.value = []
    return
  }

  try {
    const parsed = JSON.parse(rawCustom)

    if (!Array.isArray(parsed)) {
      customMedications.value = []
      return
    }

    customMedications.value = parsed.filter((medication) => {
      const hasValidCoreFields =
        medication &&
        typeof medication.id === 'string' &&
        typeof medication.name === 'string' &&
        typeof medication.variation === 'string' &&
        Number(medication.volumeMl) > 0 &&
        Number(medication.amountMg) > 0

      return hasValidCoreFields
    })
  } catch {
    customMedications.value = []
  }
}

const loadSession = () => {
  const rawAuth = sessionStorage.getItem(AUTH_KEY)

  if (!rawAuth) {
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
    return
  }

  try {
    const session = JSON.parse(rawAuth)
    const isRoleValid = session?.role === 'admin' || session?.role === 'user'

    if (!isRoleValid) {
      sessionStorage.removeItem(AUTH_KEY)
      isAuthenticated.value = false
      authUser.value = ''
      authRole.value = ''
      return
    }

    isAuthenticated.value = true
    authUser.value = session.username
    authRole.value = session.role
  } catch {
    sessionStorage.removeItem(AUTH_KEY)
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
  }
}

const saveRecentSearch = (term) => {
  const cleaned = term.trim()

  if (!cleaned) {
    return
  }

  const deduplicated = [
    cleaned,
    ...recentSearches.value.filter(
      (item) => normalizeText(item) !== normalizeText(cleaned)
    )
  ].slice(0, 8)

  recentSearches.value = deduplicated
  localStorage.setItem(RECENT_KEY, JSON.stringify(deduplicated))
}

const saveCustomMedications = () => {
  localStorage.setItem(
    CUSTOM_MEDICATIONS_KEY,
    JSON.stringify(customMedications.value)
  )
}

const clearCalculator = () => {
  prescribedMg.value = ''
  mgPerKg.value = selectedMedication.value?.mgPerKgDefault
    ? String(selectedMedication.value.mgPerKgDefault)
    : ''
  patientWeight.value = ''
  resultMl.value = ''
  calcError.value = ''
}

const resetNewMedication = () => {
  newMedication.name = ''
  newMedication.variation = ''
  newMedication.volumeMl = ''
  newMedication.amountMg = ''
  newMedication.mgPerKgDefault = ''
  newMedication.description = ''
  newMedication.indications = ''
  newMedication.image = ''
}

const populateMedicationForm = (medication) => {
  newMedication.name = medication.name
  newMedication.variation = medication.variation
  newMedication.volumeMl = String(medication.volumeMl)
  newMedication.amountMg = String(medication.amountMg)
  newMedication.mgPerKgDefault = medication.mgPerKgDefault
    ? String(medication.mgPerKgDefault)
    : ''
  newMedication.description = medication.description
  newMedication.indications = medication.indications.join(', ')
  newMedication.image = medication.image === DEFAULT_IMAGE ? '' : medication.image
}

const cancelMedicationEdition = () => {
  editingMedicationId.value = ''
  resetNewMedication()
  adminError.value = ''
  adminSuccess.value = ''
}

const startMedicationEdition = (medication) => {
  editingMedicationId.value = medication.id
  populateMedicationForm(medication)
  adminError.value = ''
  adminSuccess.value = 'Modo de edição ativado para o medicamento selecionado.'
}

const selectMedication = (medication) => {
  selectedMedication.value = medication
  searchTerm.value = medicationLabel(medication)
  saveRecentSearch(medicationLabel(medication))
  clearCalculator()
}

const handleLogin = () => {
  const username = loginUser.value.trim().toLowerCase()
  const password = loginPassword.value

  if ((username === 'admin' || username === 'user') && password === 'senha') {
    const role = username
    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        username,
        role
      })
    )

    authUser.value = username
    authRole.value = role
    isAuthenticated.value = true
    activeView.value = 'calculator'
    loginError.value = ''
    loginPassword.value = ''
    return
  }

  loginError.value =
    'Credenciais inválidas. Use admin/senha para acesso total ou user/senha para acesso à calculadora.'
}

const handleLogout = () => {
  sessionStorage.removeItem(AUTH_KEY)
  isAuthenticated.value = false
  authUser.value = ''
  authRole.value = ''
  selectedMedication.value = null
  searchTerm.value = ''
  activeView.value = 'calculator'
  clearCalculator()
  cancelMedicationEdition()
}

const useRecentSearch = (term) => {
  searchTerm.value = term

  const exactMatch = allMedications.value.find(
    (medication) => normalizeText(medicationLabel(medication)) === normalizeText(term)
  )

  if (exactMatch) {
    selectMedication(exactMatch)
    return
  }

  if (filteredMedications.value.length > 0) {
    selectMedication(filteredMedications.value[0])
  }
}

const clearRecentSearches = () => {
  recentSearches.value = []
  localStorage.removeItem(RECENT_KEY)
}

const commitSearch = () => {
  const cleaned = searchTerm.value.trim()

  if (!cleaned) {
    return
  }

  if (filteredMedications.value.length > 0) {
    selectMedication(filteredMedications.value[0])
    return
  }

  saveRecentSearch(cleaned)
}

const calculateDose = () => {
  if (!selectedMedication.value) {
    calcError.value = 'Selecione um medicamento antes de calcular.'
    resultMl.value = ''
    return
  }

  const ampouleVolume = Number(selectedMedication.value.volumeMl)
  const ampouleAmount = Number(selectedMedication.value.amountMg)

  if (ampouleVolume <= 0 || ampouleAmount <= 0) {
    calcError.value = 'Dados da ampola inválidos para cálculo.'
    resultMl.value = ''
    return
  }

  let targetMg = 0

  if (calculateByWeight.value) {
    const dosePerKg = Number(mgPerKg.value)
    const weightKg = Number(patientWeight.value)

    if (dosePerKg <= 0 || weightKg <= 0) {
      calcError.value =
        'Informe dose por kg e peso do paciente com valores maiores que zero.'
      resultMl.value = ''
      return
    }

    targetMg = dosePerKg * weightKg
  } else {
    const prescribedValue = Number(prescribedMg.value)

    if (prescribedValue <= 0) {
      calcError.value =
        'Informe a quantidade prescrita em mg com valor maior que zero.'
      resultMl.value = ''
      return
    }

    targetMg = prescribedValue
  }

  const volumeNeeded = (targetMg * ampouleVolume) / ampouleAmount
  resultMl.value = `${volumeNeeded.toFixed(2)} mL`
  calcError.value = ''
}

const addMedication = () => {
  adminError.value = ''
  adminSuccess.value = ''

  if (!canManage.value) {
    adminError.value = 'Apenas o perfil admin pode cadastrar medicamentos.'
    return
  }

  const name = newMedication.name.trim()
  const variation = newMedication.variation.trim()
  const description = newMedication.description.trim()
  const image = newMedication.image.trim() || DEFAULT_IMAGE
  const volumeMl = Number(newMedication.volumeMl)
  const amountMg = Number(newMedication.amountMg)
  const mgPerKgDefault = Number(newMedication.mgPerKgDefault)
  const indications = newMedication.indications
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!name || !variation) {
    adminError.value = 'Informe nome e variação do medicamento.'
    return
  }

  if (!description) {
    adminError.value = 'Informe uma descrição breve do medicamento.'
    return
  }

  if (volumeMl <= 0 || amountMg <= 0) {
    adminError.value = 'Volume e quantidade da ampola devem ser maiores que zero.'
    return
  }

  if (indications.length === 0) {
    adminError.value = 'Informe ao menos uma indicação clínica.'
    return
  }

  const newEntry = {
    id:
      editingMedicationId.value ||
      `${slugify(`${name}-${variation}`)}-${Date.now().toString(36)}`,
    name,
    variation,
    volumeMl,
    amountMg,
    mgPerKgDefault: mgPerKgDefault > 0 ? mgPerKgDefault : 0,
    description,
    indications,
    image
  }

  if (isEditingMedication.value) {
    const medicationExists = customMedications.value.some(
      (medication) => medication.id === editingMedicationId.value
    )

    if (!medicationExists) {
      adminError.value =
        'Não foi possível atualizar: o medicamento selecionado não foi encontrado.'
      return
    }

    customMedications.value = customMedications.value.map((medication) =>
      medication.id === editingMedicationId.value ? newEntry : medication
    )
  } else {
    customMedications.value = [newEntry, ...customMedications.value]
  }

  saveCustomMedications()
  selectMedication(newEntry)
  resetNewMedication()
  adminSuccess.value = isEditingMedication.value
    ? 'Medicamento atualizado com sucesso. As alterações já estão disponíveis na calculadora.'
    : 'Medicamento cadastrado com sucesso. Ele já está disponível na calculadora.'
  editingMedicationId.value = ''
}

const removeCustomMedication = (id) => {
  customMedications.value = customMedications.value.filter(
    (medication) => medication.id !== id
  )
  saveCustomMedications()

  if (selectedMedication.value?.id === id) {
    selectedMedication.value = null
    searchTerm.value = ''
    clearCalculator()
  }

  if (editingMedicationId.value === id) {
    cancelMedicationEdition()
  }

  adminSuccess.value = 'Medicamento removido com sucesso.'
  adminError.value = ''
}

watch(calculateByWeight, () => {
  resultMl.value = ''
  calcError.value = ''
})

watch(authRole, (role) => {
  if (role !== 'admin') {
    activeView.value = 'calculator'
    cancelMedicationEdition()
  }
})

loadSession()
loadRecentSearches()
loadCustomMedications()
</script>

<template>
  <main class="app-shell">
    <header class="card hero">
      <div>
        <p class="eyebrow">Hospital Universitário de Santa Maria</p>
        <h1>Calculadora de Dosagem HUSM</h1>
        <p class="hero-text">
          Ferramenta de apoio para regra de três de medicamentos com variações de
          diluição, cálculo padrão e cálculo por peso.
        </p>
        <p class="source-note">{{ dataSourceStatus }}</p>
      </div>
      <div v-if="isAuthenticated" class="header-actions">
        <span class="badge">Logado como {{ authUser }} ({{ roleLabel }})</span>
        <button type="button" class="btn-secondary" @click="handleLogout">
          Sair
        </button>
      </div>
    </header>

    <section v-if="!isAuthenticated" class="login-wrapper">
      <article class="card login-card">
        <h2>Acesso do profissional</h2>
        <p class="muted">
          Entre com seu usuário e senha para acessar a ferramenta de dosagem.
        </p>

        <form class="stack-form" @submit.prevent="handleLogin">
          <label class="field-group">
            <span>Usuário</span>
            <input
              v-model="loginUser"
              class="input"
              type="text"
              placeholder="Digite seu usuário"
              autocomplete="username"
            />
          </label>

          <label class="field-group">
            <span>Senha</span>
            <input
              v-model="loginPassword"
              class="input"
              type="password"
              placeholder="Digite sua senha"
              autocomplete="current-password"
            />
          </label>

          <button type="submit" class="btn-primary">Entrar</button>
        </form>

        <p class="hint">Acessos: admin/senha (total) e user/senha (somente calculadora)</p>
        <p v-if="loginError" class="error-msg">{{ loginError }}</p>
      </article>
    </section>

    <section v-else class="dashboard-shell">
      <article v-if="canManage" class="card role-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeView === 'calculator' }"
          @click="activeView = 'calculator'"
        >
          Calculadora
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeView === 'admin' }"
          @click="activeView = 'admin'"
        >
          Administração
        </button>
      </article>

      <section v-if="activeView === 'calculator' || !canManage" class="dashboard-grid">
        <article class="card search-panel">
          <h2>Pesquisar medicamento</h2>
          <p class="muted">
            Digite nome, variação ou indicação. Pressione Enter para selecionar o
            primeiro resultado.
          </p>

          <div class="search-box">
            <input
              v-model="searchTerm"
              class="input"
              type="text"
              placeholder="Ex.: dipirona, morfina, ceftriaxona"
              @keyup.enter="commitSearch"
            />
          </div>

          <ul v-if="filteredMedications.length > 0" class="result-list">
            <li v-for="medication in filteredMedications" :key="medication.id">
              <button
                type="button"
                class="result-btn"
                @click="selectMedication(medication)"
              >
                <strong>{{ medication.name }}</strong>
                <small>{{ medication.variation }}</small>
              </button>
            </li>
          </ul>
          <p v-else class="empty-text">Nenhum medicamento encontrado.</p>

          <div class="recent-wrap">
            <div class="recent-head">
              <h3>Pesquisas recentes</h3>
              <button
                type="button"
                class="text-btn"
                :disabled="recentSearches.length === 0"
                @click="clearRecentSearches"
              >
                Limpar
              </button>
            </div>

            <div class="chips">
              <button
                v-for="item in recentSearches"
                :key="item"
                type="button"
                class="chip"
                @click="useRecentSearch(item)"
              >
                {{ item }}
              </button>
              <p v-if="recentSearches.length === 0" class="empty-inline">
                Sem histórico de pesquisas.
              </p>
            </div>
          </div>
        </article>

        <article class="card detail-panel">
          <div v-if="selectedMedication">
            <div class="med-head">
              <img
                class="ampoule-image"
                :src="selectedMedication.image"
                :alt="`Ampola de ${selectedMedication.name}`"
              />
              <div>
                <h2>{{ selectedMedication.name }}</h2>
                <p class="med-variation">{{ selectedMedication.variation }}</p>
              </div>
            </div>

            <p class="med-description">{{ selectedMedication.description }}</p>

            <p class="subtitle">Indicações comuns</p>
            <ul class="indication-list">
              <li
                v-for="indication in selectedMedication.indications"
                :key="indication"
              >
                {{ indication }}
              </li>
            </ul>

            <section class="calc-card">
              <div class="calc-head">
                <h3>Calculadora</h3>
                <label class="checkbox-row">
                  <input v-model="calculateByWeight" type="checkbox" />
                  <span>Calcular por peso</span>
                </label>
              </div>

              <div class="form-grid">
                <label class="field-group">
                  <span>Volume da ampola (mL)</span>
                  <input class="input" :value="selectedMedication.volumeMl" readonly />
                </label>

                <label class="field-group">
                  <span>Quantidade na ampola (mg)</span>
                  <input class="input" :value="selectedMedication.amountMg" readonly />
                </label>

                <label v-if="!calculateByWeight" class="field-group">
                  <span>Quantidade prescrita (mg)</span>
                  <input
                    v-model="prescribedMg"
                    class="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex.: 250"
                  />
                </label>

                <template v-else>
                  <label class="field-group">
                    <span>Dose por kg (mg/kg)</span>
                    <input
                      v-model="mgPerKg"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex.: 15"
                    />
                  </label>

                  <label class="field-group">
                    <span>Peso do paciente (kg)</span>
                    <input
                      v-model="patientWeight"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex.: 72"
                    />
                  </label>
                </template>

                <label class="field-group full-row">
                  <span>Volume necessário (mL)</span>
                  <input
                    class="input result"
                    :value="resultMl"
                    readonly
                    placeholder="Resultado do cálculo"
                  />
                </label>
              </div>

              <button type="button" class="btn-primary full" @click="calculateDose">
                Calcular
              </button>

              <p v-if="calcError" class="error-msg">{{ calcError }}</p>
            </section>
          </div>

          <div v-else class="placeholder">
            <h2>Selecione um medicamento</h2>
            <p>
              Ao escolher um item na busca, você verá a descrição, indicações e a
              calculadora com os campos preenchidos automaticamente.
            </p>
          </div>
        </article>
      </section>

      <section v-if="canManage && activeView === 'admin'" class="admin-layout">
        <article class="card admin-form-card">
          <h2>Cadastro de medicamentos</h2>
          <p class="muted">
            Área administrativa para adicionar novos medicamentos à base local da aplicação.
          </p>
          <p class="provisional-note">{{ dataSourceStatus }}</p>

          <form class="admin-form" @submit.prevent="addMedication">
            <label class="field-group">
              <span>Nome do medicamento</span>
              <input
                v-model="newMedication.name"
                class="input"
                type="text"
                placeholder="Ex.: Midazolam"
              />
            </label>

            <label class="field-group">
              <span>Variação (diluição)</span>
              <input
                v-model="newMedication.variation"
                class="input"
                type="text"
                placeholder="Ex.: 5 mg / 1 mL"
              />
            </label>

            <label class="field-group">
              <span>Volume da ampola (mL)</span>
              <input
                v-model="newMedication.volumeMl"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 2"
              />
            </label>

            <label class="field-group">
              <span>Quantidade na ampola (mg)</span>
              <input
                v-model="newMedication.amountMg"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 100"
              />
            </label>

            <label class="field-group">
              <span>Dose padrão por kg (mg/kg, opcional)</span>
              <input
                v-model="newMedication.mgPerKgDefault"
                class="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 0.2"
              />
            </label>

            <label class="field-group">
              <span>Descrição breve</span>
              <textarea
                v-model="newMedication.description"
                class="input textarea"
                placeholder="Descrição clínica resumida do medicamento"
              ></textarea>
            </label>

            <label class="field-group">
              <span>Indicações (separadas por vírgula)</span>
              <input
                v-model="newMedication.indications"
                class="input"
                type="text"
                placeholder="Ex.: Sedação, Convulsão, Pré-procedimento"
              />
            </label>

            <label class="field-group">
              <span>URL da imagem (opcional)</span>
              <input
                v-model="newMedication.image"
                class="input"
                type="text"
                placeholder="https://..."
              />
            </label>

            <div class="admin-actions">
              <button type="submit" class="btn-primary">
                {{ isEditingMedication ? 'Salvar alterações' : 'Adicionar medicamento' }}
              </button>
              <button
                v-if="isEditingMedication"
                type="button"
                class="btn-secondary"
                @click="cancelMedicationEdition"
              >
                Cancelar edição
              </button>
            </div>
          </form>

          <p v-if="adminError" class="error-msg">{{ adminError }}</p>
          <p v-if="adminSuccess" class="success-msg">{{ adminSuccess }}</p>
        </article>

        <article class="card admin-list-card">
          <h2>Medicamentos adicionados</h2>
          <p class="muted">Total de cadastros locais: {{ customMedications.length }}</p>

          <ul v-if="customMedications.length > 0" class="admin-med-list">
            <li
              v-for="medication in customMedications"
              :key="medication.id"
              class="admin-med-item"
              :class="{ editing: editingMedicationId === medication.id }"
            >
              <div>
                <strong>{{ medication.name }}</strong>
                <p class="admin-meta">{{ medication.variation }}</p>
                <p class="admin-meta">
                  {{ medication.amountMg }} mg em {{ medication.volumeMl }} mL
                </p>
                <p v-if="editingMedicationId === medication.id" class="editing-tag">
                  Em edição
                </p>
              </div>

              <div class="admin-item-actions">
                <button
                  type="button"
                  class="btn-secondary compact"
                  @click="startMedicationEdition(medication)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="btn-danger compact"
                  @click="removeCustomMedication(medication.id)"
                >
                  Remover
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="empty-text">Nenhum medicamento cadastrado pelo administrador.</p>
        </article>
      </section>
    </section>
  </main>
</template>
