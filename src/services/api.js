const API_URL = 'https://medicamentos-api-n18s.onrender.com/api'

class MedicamentosAPI {
  constructor() {
    this.token = null
  }

  setToken(token) {
    this.token = token
  }

  getToken() {
    return this.token
  }

  async request(method, endpoint, data = null) {
    const url = `${API_URL}${endpoint}`
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`
    }

    if (data) {
      options.body = JSON.stringify(data)
    }

    try {
      const response = await fetch(url, options)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      const contentLength = response.headers.get('content-length')
      
      if (response.status === 204 || !contentType?.includes('application/json') || contentLength === '0') {
        return {}
      }

      const text = await response.text()
      return text ? JSON.parse(text) : {}
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error.message)
      throw error
    }
  }

  // Auth endpoints
  async login(username, senha) {
    const response = await this.request('POST', '/auth/login', {
      username,
      senha
    })
    
    if (response.token) {
      this.setToken(response.token)
    }
    
    return response
  }

  async register(username, senha) {
    return this.request('POST', '/auth/register', {
      username,
      senha
    })
  }

  // Medications endpoints
  async getMedications() {
    return this.request('GET', '/medicamentos')
  }

  async getMedicationById(id) {
    return this.request('GET', `/medicamentos/${id}`)
  }

  async createMedication(medicationData) {
    return this.request('POST', '/medicamentos', medicationData)
  }

  async updateMedication(id, medicationData) {
    return this.request('PUT', `/medicamentos/${id}`, medicationData)
  }

  async deleteMedication(id) {
    return this.request('DELETE', `/medicamentos/${id}`)
  }
}

export const api = new MedicamentosAPI()
