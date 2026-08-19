<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { api } from './services/api'

const AUTH_KEY = 'husm-auth'
const RECENT_KEY = 'husm-recent-searches'
const REPO_URL = 'https://github.com/TiagoSteffler/CalculadoraHUSM'

const loginUser = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)
const isAboutOpen = ref(false)
const authUser = ref('')
const authRole = ref('')
const authToken = ref('')
const isAuthenticated = ref(false)
const activeView = ref('calculator')
const installPromptEvent = ref(null)
const isIosDevice = ref(false)
const isStandaloneMode = ref(false)
const canInstallApp = computed(() => Boolean(installPromptEvent.value))
const showInstallCard = computed(() => !isStandaloneMode.value)
let displayModeQuery = null
let adminLayoutQuery = null
let adminFormResizeObserver = null

const searchTerm = ref('')
const selectedMedication = ref(null)
const detailPanelRef = ref(null)
const recentSearches = ref([])
const medications = ref([])
const medicationsLoading = ref(false)
const medicationsError = ref('')

const prescribedMg = ref('')
const resultMl = ref('')
const redilutionResultMl = ref('')
const redilutionIntervalLabel = ref('')
const redilutionResults = ref([])
const calcError = ref('')

const adminError = ref('')
const adminSuccess = ref('')
const adminLoading = ref(false)
const adminSearchTerm = ref('')
const editingMedicationId = ref('')
const adminFormRef = ref(null)
const adminListRef = ref(null)
const isSettingVariation = ref(false)
const variationAutoEnabled = ref(true)
const lastAutoVariation = ref('')
const createRedilutionInterval = () => ({
  operator: 'upTo',
  amountMg: '',
  volumeMl: ''
})

const createRedilutionConfig = () => ({
  notApplicable: false,
  customText: '',
  intervals: [createRedilutionInterval()]
})

const detectIosDevice = () => {
  const ua = String(navigator?.userAgent ?? '').toLowerCase()
  const isApple = /iphone|ipad|ipod/.test(ua)
  const isTouchMac = ua.includes('mac') && 'ontouchend' in document
  return isApple || isTouchMac
}

const updateStandaloneMode = () => {
  const displayMode = window.matchMedia
    ? window.matchMedia('(display-mode: standalone)').matches
    : false
  const iosStandalone = window.navigator?.standalone === true
  isStandaloneMode.value = Boolean(displayMode || iosStandalone)
}

const handleBeforeInstallPrompt = (event) => {
  event.preventDefault()
  installPromptEvent.value = event
}

const handleAppInstalled = () => {
  installPromptEvent.value = null
  updateStandaloneMode()
}

const openAbout = () => {
  isAboutOpen.value = true
}

const closeAbout = () => {
  isAboutOpen.value = false
}

const triggerInstall = async () => {
  const promptEvent = installPromptEvent.value
  if (!promptEvent) {
    return
  }

  promptEvent.prompt()
  await promptEvent.userChoice
  installPromptEvent.value = null
}

const resetAdminListSizing = () => {
  if (!adminListRef.value) {
    return
  }

  adminListRef.value.style.height = ''
  adminListRef.value.style.maxHeight = ''
  adminListRef.value.style.overflow = ''
}

const syncAdminListHeight = () => {
  if (!adminFormRef.value || !adminListRef.value || typeof window === 'undefined') {
    return
  }

  const isDesktop = window.matchMedia?.('(min-width: 1025px)').matches

  if (!isDesktop) {
    resetAdminListSizing()
    return
  }

  const height = Math.max(0, Math.round(adminFormRef.value.getBoundingClientRect().height))
  adminListRef.value.style.height = `${height}px`
  adminListRef.value.style.maxHeight = `${height}px`
  adminListRef.value.style.overflow = 'hidden'
}

const setupAdminListSync = () => {
  if (!canManage.value || activeView.value !== 'admin') {
    resetAdminListSizing()
    if (adminFormResizeObserver) {
      adminFormResizeObserver.disconnect()
      adminFormResizeObserver = null
    }
    return
  }

  if (!adminFormRef.value || !adminListRef.value || typeof window === 'undefined') {
    return
  }

  if ('ResizeObserver' in window) {
    if (adminFormResizeObserver) {
      adminFormResizeObserver.disconnect()
    }

    adminFormResizeObserver = new ResizeObserver(() => {
      syncAdminListHeight()
    })
    adminFormResizeObserver.observe(adminFormRef.value)
  }

  syncAdminListHeight()
}

const handleAdminLayoutChange = () => {
  syncAdminListHeight()
}

const newMedication = reactive({
  name: '',
  variation: '',
  volumeMl: '',
  amountMg: '',
  description: '',
  classes: '',
  reconstituition: '',
  redilutionNotApplicable: false,
  redilutionCustomText: '',
  redilutionIntervals: [createRedilutionInterval()],
  redilutionMode: 'single',
  redilutionEVDireto: createRedilutionConfig(),
  redilutionEVIntermitente: createRedilutionConfig(),
  redilutionPediatria: createRedilutionConfig(),
  redilutionAdulto: createRedilutionConfig(),
  infusionTime: ''
})

const buildVariationLabel = (amount, volume) => {
  const amountText = String(amount ?? '').trim()
  const volumeText = String(volume ?? '').trim()

  if (!amountText || !volumeText) {
    return ''
  }

  return `${amountText} mg / ${volumeText} mL`
}

const syncVariationAutoState = () => {
  const label = buildVariationLabel(newMedication.amountMg, newMedication.volumeMl)
  lastAutoVariation.value = label
  const current = String(newMedication.variation ?? '').trim()
  variationAutoEnabled.value = !current || current === label
}

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

const parseListInput = (value) =>
  String(value ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

const parseMultilineInput = (value) => {
  const raw = String(value ?? '').trim()

  if (!raw) {
    return []
  }

  if (raw.includes('\n')) {
    return raw
      .split(/\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeRedilutionIntervals = (value) => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const operator = item?.operator === 'above' ? 'above' : 'upTo'
      const amountMg = Number(item?.amountMg ?? item?.mg ?? 0)
      const volumeMl = Number(item?.volumeMl ?? item?.ml ?? 0)

      return {
        operator,
        amountMg,
        volumeMl
      }
    })
    .filter((interval) => interval.amountMg > 0 && interval.volumeMl > 0)
}

const sortRedilutionIntervals = (intervals) => {
  const sorted = [...intervals].sort((a, b) => a.amountMg - b.amountMg)
  const upTo = sorted.filter((interval) => interval.operator !== 'above')
  const above = sorted.filter((interval) => interval.operator === 'above')
  return [...upTo, ...above]
}

const formatRedilutionIntervals = (intervals) => {
  const sorted = sortRedilutionIntervals(intervals)
  const lines = []
  let previousUpper = null

  sorted.forEach((interval) => {
    const amount = interval.amountMg
    const volume = interval.volumeMl

    if (interval.operator === 'above') {
      lines.push(`acima de ${amount}mg: ${volume}ml`)
      return
    }

    if (previousUpper) {
      lines.push(`de ${previousUpper}mg até ${amount}mg: ${volume}ml`)
    } else {
      lines.push(`até ${amount}mg: ${volume}ml`)
    }

    previousUpper = amount
  })

  return lines
}

const resolveRedilutionInterval = (doseMg, intervals) => {
  const sorted = sortRedilutionIntervals(intervals)
  let previousUpper = null

  for (const interval of sorted) {
    const amount = interval.amountMg
    const volume = interval.volumeMl
    let label = ''

    if (interval.operator === 'above') {
      label = `acima de ${amount}mg: ${volume}ml`

      if (doseMg > amount) {
        return { interval, label }
      }

      continue
    }

    label = previousUpper
      ? `de ${previousUpper}mg até ${amount}mg: ${volume}ml`
      : `até ${amount}mg: ${volume}ml`

    if (doseMg <= amount) {
      return { interval, label }
    }

    previousUpper = amount
  }

  // Fallback to the largest 'upTo' interval if doseMg exceeds all defined intervals
  const upToIntervals = sorted.filter(i => i.operator !== 'above')
  if (upToIntervals.length > 0) {
    const lastInterval = upToIntervals[upToIntervals.length - 1]
    if (doseMg > lastInterval.amountMg) {
      return { 
        interval: lastInterval, 
        label: `acima de ${lastInterval.amountMg}mg (utilizando o último intervalo): ${lastInterval.volumeMl}ml` 
      }
    }
  }

  return null
}

const normalizeMedication = (medication) => {
  if (!medication || typeof medication !== 'object') {
    return null
  }

  const normalized = { ...medication }

  normalized.id = String(medication.id ?? '')
  normalized.name = String(medication.name ?? '')
  normalized.variation = String(medication.variation ?? '')
  normalized.volumeMl = Number(medication.volumeMl ?? 0)
  normalized.amountMg = Number(medication.amountMg ?? 0)
  normalized.description = String(medication.description ?? '')

  normalized.classes = toStringArray(medication.classes ?? medication.indications)
  normalized.reconstituition = toStringArray(
    medication.reconstituition ?? medication.reconstitution
  )
  normalized.diluition = toStringArray(medication.diluition ?? medication.dilution)
  normalized.redilutionNotApplicable = Boolean(medication.redilutionNotApplicable)
  normalized.redilutionCustomText = String(medication.redilutionCustomText ?? '')
  normalized.redilutionIntervals = normalizeRedilutionIntervals(
    medication.redilutionIntervals ?? medication.redilution
  )
  normalized.redilutionMode = ['single', 'ev', 'age'].includes(medication.redilutionMode)
    ? medication.redilutionMode
    : 'single'

  const normalizeRedilutionConfig = (config) => ({
    notApplicable: Boolean(config?.notApplicable),
    customText: String(config?.customText ?? ''),
    intervals: normalizeRedilutionIntervals(config?.intervals)
  })

  normalized.redilutionEVDireto = normalizeRedilutionConfig(medication.redilutionEVDireto)
  normalized.redilutionEVIntermitente = normalizeRedilutionConfig(medication.redilutionEVIntermitente)
  normalized.redilutionPediatria = normalizeRedilutionConfig(medication.redilutionPediatria)
  normalized.redilutionAdulto = normalizeRedilutionConfig(medication.redilutionAdulto)
  normalized.infusionTime = toStringArray(medication.infusionTime)

  return normalized
}

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

const sortMedications = (items) =>
  [...items].sort((a, b) => {
    const labelA = normalizeText(medicationLabel(a))
    const labelB = normalizeText(medicationLabel(b))
    return labelA.localeCompare(labelB, 'pt-BR')
  })

const canManage = computed(() => authRole.value === 'ADMIN')
const isEditingMedication = computed(() => Boolean(editingMedicationId.value))
const redilutionConfigDisplayLines = (config, legacyDiluition = []) => {
  if (config.notApplicable) {
    const custom = config.customText.trim()
    return custom ? parseMultilineInput(custom) : legacyDiluition.length > 0 ? legacyDiluition : ['Não necessita rediluição.']
  }

  return formatRedilutionIntervals(config.intervals)
}

const redilutionDisplayLines = computed(() => {
  if (selectedMedication.value?.redilutionNotApplicable) {
    const custom = selectedMedication.value?.redilutionCustomText?.trim()
    if (custom) {
      return parseMultilineInput(custom)
    }
    const legacyDiluition = toStringArray(selectedMedication.value?.diluition ?? [])
    if (legacyDiluition.length > 0) {
      return legacyDiluition
    }
    return ['Não necessita rediluição.']
  }

  const intervals = selectedMedication.value?.redilutionIntervals ?? []
  const formatted = formatRedilutionIntervals(intervals)

  if (formatted.length > 0) {
    return formatted
  }

  return toStringArray(selectedMedication.value?.diluition ?? [])
})

const redilutionDisplayGroups = computed(() => {
  const medication = selectedMedication.value

  if (!medication) {
    return []
  }

  if (medication.redilutionMode === 'ev') {
    return [
      { label: 'EV Direto', lines: redilutionConfigDisplayLines(medication.redilutionEVDireto) },
      { label: 'EV Intermitente', lines: redilutionConfigDisplayLines(medication.redilutionEVIntermitente) }
    ]
  }

  if (medication.redilutionMode === 'age') {
    return [
      { label: 'Pediatria', lines: redilutionConfigDisplayLines(medication.redilutionPediatria) },
      { label: 'Adulto', lines: redilutionConfigDisplayLines(medication.redilutionAdulto) }
    ]
  }

  return [{ label: '', lines: redilutionDisplayLines.value }]
})

const filteredMedications = computed(() => {
  const query = normalizeText(searchTerm.value.trim())

  if (!query) {
    return sortMedications(medications.value)
  }

  const filtered = medications.value.filter((medication) => {
    const searchableText = normalizeText(
      [
        medication.name,
        medication.variation,
        medication.description,
        medication.classes.join(' ')
      ].join(' ')
    )

    return searchableText.includes(query)
  })

  return sortMedications(filtered)
})

const adminFilteredMedications = computed(() => {
  const query = normalizeText(adminSearchTerm.value.trim())

  if (!query) {
    return sortMedications(medications.value)
  }

  const filtered = medications.value.filter((medication) => {
    const searchableText = normalizeText(
      [
        medication.name,
        medication.variation,
        medication.description,
        medication.classes.join(' ')
      ].join(' ')
    )

    return searchableText.includes(query)
  })

  return sortMedications(filtered)
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
    medications.value = Array.isArray(response)
      ? response.map(normalizeMedication).filter(Boolean)
      : []
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
  resultMl.value = ''
  redilutionResultMl.value = ''
  redilutionIntervalLabel.value = ''
  redilutionResults.value = []
  calcError.value = ''
}

const resetNewMedication = () => {
  newMedication.name = ''
  newMedication.variation = ''
  newMedication.volumeMl = ''
  newMedication.amountMg = ''
  newMedication.description = ''
  newMedication.classes = ''
  newMedication.reconstituition = ''
  newMedication.redilutionNotApplicable = false
  newMedication.redilutionCustomText = ''
  newMedication.redilutionIntervals = [createRedilutionInterval()]
  newMedication.redilutionMode = 'single'
  Object.assign(newMedication.redilutionEVDireto, createRedilutionConfig())
  Object.assign(newMedication.redilutionEVIntermitente, createRedilutionConfig())
  Object.assign(newMedication.redilutionPediatria, createRedilutionConfig())
  Object.assign(newMedication.redilutionAdulto, createRedilutionConfig())
  newMedication.infusionTime = ''
  lastAutoVariation.value = ''
  variationAutoEnabled.value = true
}

const populateMedicationForm = (medication) => {
  newMedication.name = medication.name
  newMedication.variation = medication.variation
  newMedication.volumeMl = String(medication.volumeMl)
  newMedication.amountMg = String(medication.amountMg)
  newMedication.description = medication.description
  newMedication.classes = medication.classes.join(', ')
  newMedication.reconstituition = medication.reconstituition.join('\n')
  newMedication.redilutionNotApplicable = Boolean(medication.redilutionNotApplicable)
  newMedication.redilutionCustomText = String(
    medication.redilutionCustomText ?? (Array.isArray(medication.diluition) ? medication.diluition.join('\n') : '')
  )
  newMedication.redilutionIntervals =
    medication.redilutionIntervals?.length > 0
      ? medication.redilutionIntervals.map((interval) => ({
          operator: interval.operator,
          amountMg: String(interval.amountMg),
          volumeMl: String(interval.volumeMl)
        }))
      : [createRedilutionInterval()]
  newMedication.redilutionMode = medication.redilutionMode

  const populateRedilutionConfig = (target, source) => {
    target.notApplicable = Boolean(source.notApplicable)
    target.customText = String(source.customText ?? '')
    target.intervals = source.intervals.length > 0
      ? source.intervals.map((interval) => ({
          operator: interval.operator,
          amountMg: String(interval.amountMg),
          volumeMl: String(interval.volumeMl)
        }))
      : [createRedilutionInterval()]
  }

  populateRedilutionConfig(newMedication.redilutionEVDireto, medication.redilutionEVDireto)
  populateRedilutionConfig(newMedication.redilutionEVIntermitente, medication.redilutionEVIntermitente)
  populateRedilutionConfig(newMedication.redilutionPediatria, medication.redilutionPediatria)
  populateRedilutionConfig(newMedication.redilutionAdulto, medication.redilutionAdulto)
  newMedication.infusionTime = medication.infusionTime.join('\n')
  syncVariationAutoState()
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

const scrollToAdminForm = async () => {
  if (typeof window === 'undefined') {
    return
  }

  const shouldScroll = window.matchMedia?.('(max-width: 1024px)').matches

  if (!shouldScroll) {
    return
  }

  await nextTick()
  adminFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const editMedicationFromAdminSearch = (medication) => {
  startMedicationEdition(medication)
  void scrollToAdminForm()
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

const clearAdminSearch = () => {
  adminSearchTerm.value = ''
}

const selectMedication = (medication) => {
  selectedMedication.value = medication
  searchTerm.value = medicationLabel(medication)
  saveRecentSearch(medicationLabel(medication))
  clearCalculator()
  void scrollToMedicationDetails()
}

const commitAdminSearch = () => {
  const cleaned = adminSearchTerm.value.trim()

  if (!cleaned) {
    return
  }

  if (adminFilteredMedications.value.length > 0) {
    editMedicationFromAdminSearch(adminFilteredMedications.value[0])
  }
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

    const role = String(response.role ?? '').toUpperCase()
    
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
  api.logout?.()
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

const addRedilutionInterval = (config) => {
  config.intervals.push(createRedilutionInterval())
}

const removeRedilutionInterval = (config, index) => {
  if (config.intervals.length === 1) {
    Object.assign(config.intervals[0], createRedilutionInterval())
    return
  }

  config.intervals.splice(index, 1)
}

const asRedilutionConfig = (notApplicable, customText, intervals) => ({
  notApplicable: Boolean(notApplicable),
  customText: String(customText ?? '').trim(),
  intervals: Boolean(notApplicable) ? [] : parseRedilutionIntervals(intervals)
})

const hasValidRedilutionConfig = (config) =>
  config.notApplicable || config.intervals.length > 0

const getRedilutionResult = (doseMg, config) => {
  if (config.notApplicable) {
    return { notApplicable: true, customText: config.customText, value: '', intervalLabel: '' }
  }

  if (config.intervals.length === 0) {
    return { error: 'Nenhum intervalo de rediluição cadastrado.' }
  }

  const resolvedInterval = resolveRedilutionInterval(doseMg, config.intervals)

  if (!resolvedInterval) {
    return { error: 'Nenhum intervalo de rediluição compatível com a dose informada.' }
  }

  const diluentNeeded = (doseMg * resolvedInterval.interval.volumeMl) / resolvedInterval.interval.amountMg
  return {
    notApplicable: false,
    customText: '',
    value: `${diluentNeeded.toFixed(2)} mL`,
    intervalLabel: resolvedInterval.label
  }
}

const parseRedilutionIntervals = (intervals) =>
  intervals
    .map((interval) => {
      const operator = interval.operator === 'above' ? 'above' : 'upTo'
      const amountMg = Number(interval.amountMg)
      const volumeMl = Number(interval.volumeMl)

      if (!Number.isFinite(amountMg) || amountMg <= 0) {
        return null
      }

      if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
        return null
      }

      return {
        operator,
        amountMg,
        volumeMl
      }
    })
    .filter(Boolean)

const calculateDose = () => {
  const clearResults = () => {
    resultMl.value = ''
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    redilutionResults.value = []
  }

  if (!selectedMedication.value) {
    calcError.value = 'Selecione um medicamento antes de calcular.'
    clearResults()
    return
  }

  const ampouleVolume = Number(selectedMedication.value.volumeMl)
  const ampouleAmount = Number(selectedMedication.value.amountMg)

  if (ampouleVolume <= 0 || ampouleAmount <= 0) {
    calcError.value = 'Dados da ampola inválidos para cálculo.'
    clearResults()
    return
  }

  const prescribedValue = Number(prescribedMg.value)

  if (prescribedValue <= 0) {
    calcError.value = 'Informe a quantidade prescrita em mg com valor maior que zero.'
    clearResults()
    return
  }

  const medication = selectedMedication.value
  const volumeNeeded = (prescribedValue * ampouleVolume) / ampouleAmount
  resultMl.value = `${volumeNeeded.toFixed(2)} mL`

  const configurations = medication.redilutionMode === 'ev'
    ? [
        { label: 'EV Direto', config: medication.redilutionEVDireto },
        { label: 'EV Intermitente', config: medication.redilutionEVIntermitente }
      ]
    : medication.redilutionMode === 'age'
      ? [
          { label: 'Pediatria', config: medication.redilutionPediatria },
          { label: 'Adulto', config: medication.redilutionAdulto }
        ]
      : [
          {
            label: '',
            config: {
              notApplicable: medication.redilutionNotApplicable,
              customText: medication.redilutionCustomText,
              intervals: medication.redilutionIntervals
            }
          }
        ]

  const results = configurations.map(({ label, config }) => ({
    label,
    ...getRedilutionResult(prescribedValue, config)
  }))
  const failedResult = results.find((result) => result.error)

  if (failedResult) {
    calcError.value = failedResult.label
      ? `${failedResult.label}: ${failedResult.error}`
      : failedResult.error
    redilutionResultMl.value = ''
    redilutionIntervalLabel.value = ''
    redilutionResults.value = []
    return
  }

  redilutionResults.value = results
  redilutionResultMl.value = results.length === 1 ? results[0].value : ''
  redilutionIntervalLabel.value = results.length === 1 ? results[0].intervalLabel : ''
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
  const volumeMl = Number(newMedication.volumeMl)
  const amountMg = Number(newMedication.amountMg)
  const classes = parseListInput(newMedication.classes)
  const reconstituition = parseMultilineInput(newMedication.reconstituition)
  const redilutionMode = newMedication.redilutionMode
  const redilutionNotApplicable = Boolean(newMedication.redilutionNotApplicable)
  const redilutionCustomText = String(newMedication.redilutionCustomText ?? '').trim()
  const redilutionIntervals = redilutionNotApplicable
    ? []
    : parseRedilutionIntervals(newMedication.redilutionIntervals)
  const redilutionEVDireto = asRedilutionConfig(
    newMedication.redilutionEVDireto.notApplicable,
    newMedication.redilutionEVDireto.customText,
    newMedication.redilutionEVDireto.intervals
  )
  const redilutionEVIntermitente = asRedilutionConfig(
    newMedication.redilutionEVIntermitente.notApplicable,
    newMedication.redilutionEVIntermitente.customText,
    newMedication.redilutionEVIntermitente.intervals
  )
  const redilutionPediatria = asRedilutionConfig(
    newMedication.redilutionPediatria.notApplicable,
    newMedication.redilutionPediatria.customText,
    newMedication.redilutionPediatria.intervals
  )
  const redilutionAdulto = asRedilutionConfig(
    newMedication.redilutionAdulto.notApplicable,
    newMedication.redilutionAdulto.customText,
    newMedication.redilutionAdulto.intervals
  )
  const infusionTime = parseMultilineInput(newMedication.infusionTime)

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

  if (classes.length === 0) {
    adminError.value = 'Informe ao menos uma classe.'
    return
  }

  const invalidSingle = redilutionMode === 'single' && !redilutionNotApplicable && redilutionIntervals.length === 0
  const invalidEv = redilutionMode === 'ev' && (!hasValidRedilutionConfig(redilutionEVDireto) || !hasValidRedilutionConfig(redilutionEVIntermitente))
  const invalidAge = redilutionMode === 'age' && (!hasValidRedilutionConfig(redilutionPediatria) || !hasValidRedilutionConfig(redilutionAdulto))

  if (invalidSingle || invalidEv || invalidAge) {
    adminError.value = redilutionMode === 'single'
      ? 'Informe ao menos um intervalo de rediluição válido ou marque "Não se aplica / Outras regras".'
      : 'Configure ao menos um intervalo válido ou uma regra alternativa para cada modalidade de rediluição.'
    return
  }

  const medicationData = {
    name,
    variation,
    volumeMl,
    amountMg,
    description,
    classes,
    reconstituition,
    redilutionMode,
    redilutionNotApplicable,
    redilutionCustomText,
    redilutionIntervals,
    redilutionEVDireto,
    redilutionEVIntermitente,
    redilutionPediatria,
    redilutionAdulto,
    infusionTime
  }

  try {
    adminLoading.value = true
    let newEntry

    if (isEditingMedication.value) {
      await api.updateMedication(editingMedicationId.value, medicationData)
      newEntry = normalizeMedication({
        id: editingMedicationId.value,
        ...medicationData
      })
    } else {
      const id = `${slugify(`${name}-${variation}`)}-${Date.now().toString(36)}`
      await api.createMedication({ id, ...medicationData })
      newEntry = normalizeMedication({ id, ...medicationData })
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

watch([prescribedMg], () => {
  resultMl.value = ''
  redilutionResultMl.value = ''
  redilutionIntervalLabel.value = ''
  redilutionResults.value = []
  calcError.value = ''
})

watch(() => newMedication.variation, (value) => {
  if (isSettingVariation.value) {
    return
  }

  const trimmed = String(value ?? '').trim()

  if (!trimmed) {
    variationAutoEnabled.value = true
    return
  }

  variationAutoEnabled.value = trimmed === lastAutoVariation.value
})

watch([() => newMedication.amountMg, () => newMedication.volumeMl], () => {
  const label = buildVariationLabel(newMedication.amountMg, newMedication.volumeMl)
  lastAutoVariation.value = label

  if (!variationAutoEnabled.value) {
    return
  }

  isSettingVariation.value = true
  newMedication.variation = label
  isSettingVariation.value = false
})

watch(authRole, (role) => {
  if (role !== 'ADMIN') {
    activeView.value = 'calculator'
    cancelMedicationEdition()
  }
})

watch([activeView, canManage], async () => {
  await nextTick()
  setupAdminListSync()
})

onMounted(() => {
  isIosDevice.value = detectIosDevice()
  updateStandaloneMode()

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)

  if (window.matchMedia) {
    displayModeQuery = window.matchMedia('(display-mode: standalone)')
    if (displayModeQuery.addEventListener) {
      displayModeQuery.addEventListener('change', updateStandaloneMode)
    } else if (displayModeQuery.addListener) {
      displayModeQuery.addListener(updateStandaloneMode)
    }
  }

  if (window.matchMedia) {
    adminLayoutQuery = window.matchMedia('(min-width: 1025px)')
    if (adminLayoutQuery.addEventListener) {
      adminLayoutQuery.addEventListener('change', handleAdminLayoutChange)
    } else if (adminLayoutQuery.addListener) {
      adminLayoutQuery.addListener(handleAdminLayoutChange)
    }
  }

  setupAdminListSync()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)

  if (displayModeQuery?.removeEventListener) {
    displayModeQuery.removeEventListener('change', updateStandaloneMode)
  } else if (displayModeQuery?.removeListener) {
    displayModeQuery.removeListener(updateStandaloneMode)
  }

  if (adminLayoutQuery?.removeEventListener) {
    adminLayoutQuery.removeEventListener('change', handleAdminLayoutChange)
  } else if (adminLayoutQuery?.removeListener) {
    adminLayoutQuery.removeListener(handleAdminLayoutChange)
  }

  if (adminFormResizeObserver) {
    adminFormResizeObserver.disconnect()
    adminFormResizeObserver = null
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

      <article v-if="showInstallCard" class="card login-card install-card">
        <div class="install-header">
          <h3>Instalar app</h3>
          <span class="badge">PWA</span>
        </div>
        <p class="muted">
          Tenha acesso rápido pela tela inicial do seu dispositivo.
        </p>

        <div class="install-actions">
          <button
            v-if="canInstallApp"
            type="button"
            class="btn-primary"
            @click="triggerInstall"
          >
            Instalar app
          </button>
          <p v-else class="install-hint">
            Se o botão não aparecer, siga os passos abaixo.
            
          </p>
        </div>

        <div class="install-steps">
          <p>
            <strong>Android (Chrome/Edge):</strong> Menu (três pontos) → Instalar
            app | Adicionar à tela inicial.
          </p>
          <p>
            <strong>iPhone (Safari):</strong> Compartilhar → Adicionar à Tela de Início.
          </p>
          <p>
            <strong>Chrome/Edge (Windows/MacOS):</strong> Menu (três pontos) → Transmitir, salvar e compartilhar → Instalar Calculadora HUSM | Criar atalho.
          </p>
          <p>
            <strong>Safari (MacOS):</strong> Compartilhar → Adicionar ao Dock.
          </p>
        </div>
      </article>

      <footer class="login-footer">
        <button type="button" class="about-link" @click="openAbout">
          Sobre o app
        </button>
      </footer>
    </section>

    <section v-else class="dashboard-shell">
      <section v-if="activeView === 'calculator' || !canManage" class="dashboard-grid">
        <article class="card search-panel">
          <h2>Pesquisar medicamento</h2>
          <p class="muted">
            Digite nome, apresentação ou classe. Pressione Enter para selecionar o
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
                <div>
                  <h2>{{ selectedMedication.name }}</h2>
                  <p class="med-variation">{{ selectedMedication.variation }}</p>
                </div>
              </div>

              <p class="med-description">{{ selectedMedication.description }}</p>

              <p class="subtitle">Classe</p>
              <ul class="indication-list" v-if="selectedMedication.classes.length > 0">
                <li v-for="item in selectedMedication.classes" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>

              <p class="subtitle">Reconstituição</p>
              <ul
                class="indication-list"
                v-if="selectedMedication.reconstituition.length > 0"
              >
                <li
                  v-for="item in selectedMedication.reconstituition"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>

              <p class="subtitle">Rediluição</p>
              <div
                v-for="group in redilutionDisplayGroups"
                :key="group.label || 'padrão'"
                class="redilution-detail-group"
              >
                <p v-if="group.label" class="redilution-detail-title">{{ group.label }}</p>
                <ul class="indication-list" v-if="group.lines.length > 0">
                  <li v-for="item in group.lines" :key="item">{{ item }}</li>
                </ul>
                <p v-else class="empty-text">Não informado.</p>
              </div>

              <p class="subtitle">Tempo de infusão</p>
              <ul
                class="indication-list"
                v-if="selectedMedication.infusionTime.length > 0"
              >
                <li v-for="item in selectedMedication.infusionTime" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="empty-text">Não informado.</p>
            </div>

            <div class="detail-calc">
              <section class="calc-card">
              <div class="calc-head">
                <h3>Calculadora</h3>
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

                <label class="field-group">
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

                <button type="button" class="btn-primary full" style="margin-top: 1rem; grid-column: 1 / -1;" @click="calculateDose">
                  Calcular
                </button>

                <label class="field-group full-row">
                  <span>Volume necessário (mL)</span>
                  <input
                    class="input result"
                    :value="resultMl"
                    readonly
                    placeholder="Resultado do cálculo"
                  />
                </label>

                <template v-if="selectedMedication.redilutionMode === 'single'">
                  <label
                    v-if="!selectedMedication.redilutionNotApplicable"
                    class="field-group full-row"
                  >
                    <span>Rediluir em (mL)</span>
                    <input
                      class="input result"
                      :value="redilutionResultMl"
                      readonly
                      placeholder="Resultado da rediluição"
                    />
                  </label>

                  <div v-else class="field-group full-row not-applicable-container">
                    <span>Rediluição</span>
                    <div class="not-applicable-box">
                      <div class="not-applicable-badge">Não necessita rediluição</div>
                      <div v-if="selectedMedication.redilutionCustomText" class="not-applicable-text">
                        {{ selectedMedication.redilutionCustomText }}
                      </div>
                      <div v-else-if="selectedMedication.diluition?.length > 0" class="not-applicable-text">
                        <p v-for="item in selectedMedication.diluition" :key="item">{{ item }}</p>
                      </div>
                    </div>
                  </div>

                  <p v-if="!selectedMedication.redilutionNotApplicable && redilutionIntervalLabel" class="hint full-row">
                    Intervalo aplicado: {{ redilutionIntervalLabel }}
                  </p>
                </template>

                <div v-else class="dual-redilution-results full-row">
                  <article
                    v-for="result in redilutionResults"
                    :key="result.label"
                    class="dual-redilution-card"
                  >
                    <h4>{{ result.label }}</h4>
                    <template v-if="result.notApplicable">
                      <p class="not-applicable-badge">Não necessita rediluição</p>
                      <p v-if="result.customText" class="not-applicable-text">{{ result.customText }}</p>
                    </template>
                    <template v-else>
                      <span class="result-caption">Rediluir em</span>
                      <strong class="dual-result-value">{{ result.value || '—' }}</strong>
                      <p v-if="result.intervalLabel" class="hint">Intervalo aplicado: {{ result.intervalLabel }}</p>
                    </template>
                  </article>
                </div>
              </div>

              <p v-if="calcError" class="error-msg">{{ calcError }}</p>
              </section>
            </div>
          </div>

          <div v-else class="placeholder">
            <h2>Selecione um medicamento</h2>
            <p>
              Ao escolher um item na busca, você verá a descrição, classe, reconstituição,
              rediluição, tempo de infusão e a calculadora com os campos preenchidos.
            </p>
          </div>
        </article>
      </section>

      <section v-if="canManage && activeView === 'admin'" class="admin-layout">
        <article ref="adminFormRef" class="card admin-form-card">
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
              <span>Variação (diluição)</span>
              <input
                v-model="newMedication.variation"
                class="input"
                type="text"
                placeholder="Ex.: 5 mg / 1 mL"
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
              <span>Classe (separar por vírgula para mais de um item)</span>
              <input
                v-model="newMedication.classes"
                class="input"
                type="text"
                placeholder="Ex.: Antiviral, Penicilina, ..."
              />
            </label>

            <label class="field-group">
              <span>Reconstituição (1 item por linha)</span>
              <textarea
                v-model="newMedication.reconstituition"
                class="input textarea"
                placeholder="Ex.: 1.000.000 UI: 2 mL"
              ></textarea>
            </label>

            <fieldset class="field-group redilution-mode-fieldset">
              <legend>Modo de Rediluição</legend>
              <p class="hint">Escolha uma única forma de configurar a rediluição deste medicamento.</p>
              <div class="redilution-mode-options">
                <label class="radio-inline-label">
                  <input v-model="newMedication.redilutionMode" type="radio" value="single" />
                  <span>Rediluição padrão</span>
                </label>
                <label class="radio-inline-label">
                  <input v-model="newMedication.redilutionMode" type="radio" value="ev" />
                  <span>Por tipo EV (direto/intermitente)</span>
                </label>
                <label class="radio-inline-label">
                  <input v-model="newMedication.redilutionMode" type="radio" value="age" />
                  <span>Por faixa etária (pediatria/adulto)</span>
                </label>
              </div>
            </fieldset>

            <template v-if="newMedication.redilutionMode === 'single'">
              <section class="field-group redilution-config-section">
                <div class="field-head-row">
                  <h3>Rediluição padrão (intervalos)</h3>
                  <label class="checkbox-inline-label">
                    <input v-model="newMedication.redilutionNotApplicable" type="checkbox" />
                    <span>Não se aplica / Outras regras</span>
                  </label>
                </div>

                <div v-if="!newMedication.redilutionNotApplicable" class="redilution-intervals">
                  <button type="button" class="btn-secondary compact" @click="newMedication.redilutionIntervals.push(createRedilutionInterval())">
                    Adicionar intervalo
                  </button>
                  <div v-for="(interval, index) in newMedication.redilutionIntervals" :key="`single-interval-${index}`" class="redilution-row">
                    <select v-model="interval.operator" class="input">
                      <option value="upTo">até</option>
                      <option value="above">acima de</option>
                    </select>
                    <div class="input-unit-wrap">
                      <input v-model="interval.amountMg" class="input input-unit" type="number" min="0" step="0.01" placeholder="0" />
                      <span class="input-unit-label">mg</span>
                    </div>
                    <div class="input-unit-wrap">
                      <input v-model="interval.volumeMl" class="input input-unit" type="number" min="0" step="0.01" placeholder="0" />
                      <span class="input-unit-label">mL</span>
                    </div>
                    <button type="button" class="btn-danger compact" @click="removeRedilutionInterval(newMedication, index)">
                      Remover
                    </button>
                  </div>
                </div>
                <div v-else class="redilution-custom-wrap">
                  <textarea v-model="newMedication.redilutionCustomText" class="input textarea" placeholder="Descreva os detalhes ou regras de rediluição" rows="3"></textarea>
                </div>
              </section>
            </template>

            <template v-else>
              <div class="dual-redilution-configs">
                <section
                  v-for="item in (newMedication.redilutionMode === 'ev'
                    ? [
                        { key: 'redilutionEVDireto', label: 'EV Direto' },
                        { key: 'redilutionEVIntermitente', label: 'EV Intermitente' }
                      ]
                    : [
                        { key: 'redilutionPediatria', label: 'Pediatria' },
                        { key: 'redilutionAdulto', label: 'Adulto' }
                      ])"
                  :key="item.key"
                  class="redilution-config-section"
                >
                  <div class="field-head-row">
                    <h3>{{ item.label }}</h3>
                    <label class="checkbox-inline-label">
                      <input v-model="newMedication[item.key].notApplicable" type="checkbox" />
                      <span>Não se aplica / Outras regras</span>
                    </label>
                  </div>

                  <div v-if="!newMedication[item.key].notApplicable" class="redilution-intervals">
                    <button type="button" class="btn-secondary compact" @click="addRedilutionInterval(newMedication[item.key])">
                      Adicionar intervalo
                    </button>
                    <div v-for="(interval, index) in newMedication[item.key].intervals" :key="`${item.key}-interval-${index}`" class="redilution-row">
                      <select v-model="interval.operator" class="input">
                        <option value="upTo">até</option>
                        <option value="above">acima de</option>
                      </select>
                      <div class="input-unit-wrap">
                        <input v-model="interval.amountMg" class="input input-unit" type="number" min="0" step="0.01" placeholder="0" />
                        <span class="input-unit-label">mg</span>
                      </div>
                      <div class="input-unit-wrap">
                        <input v-model="interval.volumeMl" class="input input-unit" type="number" min="0" step="0.01" placeholder="0" />
                        <span class="input-unit-label">mL</span>
                      </div>
                      <button type="button" class="btn-danger compact" @click="removeRedilutionInterval(newMedication[item.key], index)">
                        Remover
                      </button>
                    </div>
                  </div>
                  <div v-else class="redilution-custom-wrap">
                    <textarea v-model="newMedication[item.key].customText" class="input textarea" placeholder="Descreva os detalhes ou regras de rediluição" rows="3"></textarea>
                  </div>
                </section>
              </div>
            </template>

            <label class="field-group">
              <span>Tempo de infusão (1 item por linha)</span>
              <textarea
                v-model="newMedication.infusionTime"
                class="input textarea"
                placeholder="Ex.: Crianças: 60 min"
              ></textarea>
            </label>

            <div class="admin-actions">
              <button
                type="submit"
                class="btn-primary"
                :disabled="adminLoading"
              >
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

        <article ref="adminListRef" class="card admin-list-card">
          <h2>Medicamentos adicionados</h2>
          <p class="muted">Total de cadastros: {{ medications.length }}</p>

          <p class="muted">
            Pesquise por nome, apresentação ou classe. Pressione Enter para editar o
            primeiro resultado.
          </p>

          <div class="search-box">
            <input
              v-model="adminSearchTerm"
              class="input search-input"
              type="text"
              placeholder="Ex.: dipirona, ceftriaxona, antifúngico"
              @keyup.enter="commitAdminSearch"
            />
            <button
              v-if="adminSearchTerm"
              type="button"
              class="clear-btn"
              aria-label="Limpar busca"
              @click="clearAdminSearch"
            >
              ×
            </button>
          </div>

          <ul v-if="adminFilteredMedications.length > 0" class="admin-med-list">
            <li
              v-for="medication in adminFilteredMedications"
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
                  @click="editMedicationFromAdminSearch(medication)"
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
          <p v-else class="empty-text">
            {{ adminSearchTerm ? 'Nenhum medicamento encontrado.' : 'Nenhum medicamento cadastrado.' }}
          </p>
        </article>
      </section>
    </section>

    <div
      v-if="isAboutOpen"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sobre o app"
      @click.self="closeAbout"
    >
      <div class="modal-card">
        <div class="modal-header">
          <h3>Sobre o app</h3>
          <button
            type="button"
            class="modal-close"
            aria-label="Fechar"
            @click="closeAbout"
          >
            ×
          </button>
        </div>
        <div class="modal-body">
          <p>
            Aplicativo desenvolvido por estudantes do PET-CC para o Hospital Universit&aacute;rio
            de Santa Maria (UFSM).
          </p>
          <p>
            Esta calculadora permite calcular, de forma r&aacute;pida e segura, a quantidade e
            a redilu&iacute;&ccedil;&atilde;o de um medicamento prescrito, apoiando o trabalho do profissional
            da sa&uacute;de.
          </p>
          <p>
            A aplica&ccedil;&atilde;o web pode ser acessada pelo navegador ou instalada em dispositivos
            m&oacute;veis e computadores.
          </p>
          <p>
            O reposit&oacute;rio do aplicativo est&aacute; dispon&iacute;vel
            <a :href="REPO_URL" target="_blank" rel="noreferrer">neste GitHub</a>.
          </p>
          <p class="modal-signature">PET-CC - 2026</p>
        </div>
      </div>
    </div>
  </main>
</template>