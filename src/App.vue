<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { api } from './services/api'

const AUTH_KEY = 'husm-auth'
const RECENT_KEY = 'husm-recent-searches'
const DEFAULT_IMAGE = '/images/ampola.svg'

const loginUser = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)
const authUser = ref('')
const authRole = ref('')
const authToken = ref('')
const isAuthenticated = ref(false)
const activeView = ref('calculator')

const searchTerm = ref('')
const selectedMedication = ref(null)
const detailPanelRef = ref(null)
const recentSearches = ref([])
const medications = ref([])
const medicationsLoading = ref(false)
const medicationsError = ref('')

const calculateByWeight = ref(false)
const prescribedMg = ref('')
const mgPerKg = ref('')
const patientWeight = ref('')
const resultMl = ref('')
const calcError = ref('')

const adminError = ref('')
const adminSuccess = ref('')
const adminLoading = ref(false)
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
  `${medication.name} ${medication.variation}`

const canManage = computed(() => authRole.value === 'ADMIN')
const isEditingMedication = computed(() => Boolean(editingMedicationId.value))

const filteredMedications = computed(() => {
  const query = normalizeText(searchTerm.value.trim())

  if (!query) {
    return medications.value
  }

  return medications.value.filter((medication) => {
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
  authRole.value === 'ADMIN' ? 'Administrador' : 'Profissional'
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

const loadMedications = async () => {
  try {
    medicationsLoading.value = true
    medicationsError.value = ''
    const response = await api.getMedications()
    medications.value = Array.isArray(response) ? response : []
  } catch (error) {
    medicationsError.value = 'Erro ao carregar medicamentos. Tente recarregar a página.'
    console.error('Erro ao carregar medicamentos:', error)
    medications.value = []
  } finally {
    medicationsLoading.value = false
  }
}

const loadSession = () => {
  const rawAuth = sessionStorage.getItem(AUTH_KEY)

  if (!rawAuth) {
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
    authToken.value = ''
    return
  }

  try {
    const session = JSON.parse(rawAuth)
    const isRoleValid = session?.role === 'ADMIN' || session?.role === 'USER'

    if (!isRoleValid || !session?.token) {
      sessionStorage.removeItem(AUTH_KEY)
      isAuthenticated.value = false
      authUser.value = ''
      authRole.value = ''
      authToken.value = ''
      return
    }

    isAuthenticated.value = true
    authUser.value = session.username
    authRole.value = session.role
    authToken.value = session.token
    api.setToken(session.token)
  } catch {
    sessionStorage.removeItem(AUTH_KEY)
    isAuthenticated.value = false
    authUser.value = ''
    authRole.value = ''
    authToken.value = ''
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

const scrollToMedicationDetails = async () => {
  if (typeof window === 'undefined') {
    return
  }

  const shouldScroll = window.matchMedia?.('(max-width: 1024px)').matches

  if (!shouldScroll) {
    return
  }

  await nextTick()
  detailPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const clearSearch = () => {
  searchTerm.value = ''
}

const selectMedication = (medication) => {
  selectedMedication.value = medication
  searchTerm.value = medicationLabel(medication)
  saveRecentSearch(medicationLabel(medication))
  clearCalculator()
  void scrollToMedicationDetails()
}

const handleLogin = async () => {
  const username = loginUser.value.trim().toLowerCase()
  const senha = loginPassword.value

  if (!username || !senha) {
    loginError.value = 'Informe usuário e senha.'
    return
  }

  try {
    loginLoading.value = true
    loginError.value = ''
    
    const response = await api.login(username, senha)
    
    const role = response.role || response.role?.toUpperCase()
    
    sessionStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        username,
        role,
        token: response.token
      })
    )

    authUser.value = username
    authRole.value = role
    authToken.value = response.token
    isAuthenticated.value = true
    activeView.value = 'calculator'
    loginPassword.value = ''
    
    await loadMedications()
  } catch (error) {
    if (error.message == "HTTP 401") {
      loginError.value = 'Falha ao fazer login. Verifique suas credenciais.';
    } else {
      loginError.value = error.message; 
    }
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = () => {
  sessionStorage.removeItem(AUTH_KEY)
  api.setToken(null)
  isAuthenticated.value = false
  authUser.value = ''
  authRole.value = ''
  authToken.value = ''
  selectedMedication.value = null
  searchTerm.value = ''
  activeView.value = 'calculator'
  clearCalculator()
  cancelMedicationEdition()
}

const useRecentSearch = (term) => {
  searchTerm.value = term

  const exactMatch = medications.value.find(
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

const addMedication = async () => {
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

  const medicationData = {
    name,
    variation,
    volumeMl,
    amountMg,
    mgPerKgDefault: mgPerKgDefault > 0 ? mgPerKgDefault : 0,
    description,
    indications,
    image
  }

  try {
    adminLoading.value = true
    let newEntry

    if (isEditingMedication.value) {
      await api.updateMedication(editingMedicationId.value, medicationData)
      newEntry = { id: editingMedicationId.value, ...medicationData }
    } else {
      const id = `${slugify(`${name}-${variation}`)}-${Date.now().toString(36)}`
      await api.createMedication({ id, ...medicationData })
      newEntry = { id, ...medicationData }
    }

    selectMedication(newEntry)
    resetNewMedication()
    adminSuccess.value = isEditingMedication.value
      ? 'Medicamento atualizado com sucesso.'
      : 'Medicamento cadastrado com sucesso.'
    editingMedicationId.value = ''
    
    await loadMedications()
  } catch (error) {
    adminError.value = error.message || 'Erro ao salvar medicamento. Tente novamente.'
  } finally {
    adminLoading.value = false
  }
}

const removeCustomMedication = async (id) => {
  try {
    adminError.value = ''
    adminSuccess.value = ''
    adminLoading.value = true
    
    await api.deleteMedication(id)

    if (selectedMedication.value?.id === id) {
      selectedMedication.value = null
      searchTerm.value = ''
      clearCalculator()
    }

    if (editingMedicationId.value === id) {
      cancelMedicationEdition()
    }

    adminSuccess.value = 'Medicamento removido com sucesso.'
    await loadMedications()
  } catch (error) {
    adminError.value = error.message || 'Erro ao remover medicamento.'
  } finally {
    adminLoading.value = false
  }
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
loadMedications()
</script>

<template>
  <main class="app-shell">
    <header class="card hero">
      <div class="hero-title">
        <p class="eyebrow">Hospital Universitário de Santa Maria</p>
        <h1>Calculadora de Dosagem HUSM</h1>
        <!--<p class="hero-text">
          Ferramenta de apoio para regra de três de medicamentos com variações de
          diluição, cálculo padrão e cálculo por peso.
        </p>-->
      </div>
      <div v-if="isAuthenticated" class="hero-controls">
        <div class="header-actions">
          <span class="badge">Logado como {{ authUser }} ({{ roleLabel }})</span>
        </div>

        <div class="header-nav">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeView === 'calculator' }"
            aria-label="Calculadora"
            @click="activeView = 'calculator'"
          >
            <span class="tab-icon" aria-hidden="true">🧮</span>
            <span class="tab-text">Calculadora</span>
          </button>

          <button
            v-if="canManage"
            type="button"
            class="tab-btn"
            :class="{ active: activeView === 'admin' }"
            aria-label="Administração"
            @click="activeView = 'admin'"
          >
            <span class="tab-icon" aria-hidden="true">⚙️</span>
            <span class="tab-text">Administração</span>
          </button>

          <button
            type="button"
            class="btn-secondary logout-btn"
            aria-label="Sair"
            @click="handleLogout"
          >
            <span class="tab-icon" aria-hidden="true">➜]</span>
            <span class="tab-text">Sair</span>
          </button>
        </div>
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

          <button type="submit" class="btn-primary" :disabled="loginLoading">
            {{ loginLoading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        <p v-if="loginError" class="error-msg">{{ loginError }}</p>
      </article>
    </section>

    <section v-else class="dashboard-shell">
      <section v-if="activeView === 'calculator' || !canManage" class="dashboard-grid">
        <article class="card search-panel">
          <h2>Pesquisar medicamento</h2>
          <p class="muted">
            Digite nome, variação ou indicação. Pressione Enter para selecionar o
            primeiro resultado.
          </p>

          <p v-if="medicationsError" class="error-msg">{{ medicationsError }}</p>
          <p v-if="medicationsLoading" class="muted">Carregando medicamentos...</p>

          <div class="search-box">
            <input
              v-model="searchTerm"
              class="input search-input"
              type="text"
              placeholder="Ex.: dipirona, morfina, ceftriaxona"
              @keyup.enter="commitSearch"
            />
            <button
              v-if="searchTerm"
              type="button"
              class="clear-btn"
              aria-label="Limpar busca"
              @click="clearSearch"
            >
              ×
            </button>
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

        <article ref="detailPanelRef" class="card detail-panel">
          <div v-if="selectedMedication" class="detail-layout">
            <div class="detail-info">
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
            </div>

            <div class="detail-calc">
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
          <!--<p class="muted">
            Área administrativa para adicionar novos medicamentos à base local da aplicação.
          </p>-->

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
              <button type="submit" class="btn-primary" :disabled="adminLoading">
                {{ adminLoading ? 'Salvando...' : isEditingMedication ? 'Salvar alterações' : 'Adicionar medicamento' }}
              </button>
              <button
                v-if="isEditingMedication"
                type="button"
                class="btn-secondary"
                :disabled="adminLoading"
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
          <p class="muted">Total de cadastros: {{ medications.length }}</p>

          <ul v-if="medications.length > 0" class="admin-med-list">
            <li
              v-for="medication in medications"
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
                  :disabled="adminLoading"
                  @click="startMedicationEdition(medication)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="btn-danger compact"
                  :disabled="adminLoading"
                  @click="removeCustomMedication(medication.id)"
                >
                  Remover
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="empty-text">Nenhum medicamento cadastrado.</p>
        </article>
      </section>
    </section>
  </main>
</template>
