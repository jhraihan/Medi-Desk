import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000/",
});

// Attach JWT access token to every outgoing request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Authentication
export async function login(username, password) {
  const response = await API.post("login/", { username, password });
  return response.data;
}

export async function register(userData) {
  const response = await API.post("register/", userData);
  return response.data;
}

// Helper factory for standard CRUD endpoints
function createCrudApi(resourcePath) {
  return {
    list: async (params) => {
      const response = await API.get(`${resourcePath}/`, { params });
      return response.data;
    },
    get: async (id) => {
      const response = await API.get(`${resourcePath}/${id}/`);
      return response.data;
    },
    create: async (data) => {
      const response = await API.post(`${resourcePath}/`, data);
      return response.data;
    },
    update: async (id, data) => {
      const response = await API.put(`${resourcePath}/${id}/`, data);
      return response.data;
    },
    patch: async (id, data) => {
      const response = await API.patch(`${resourcePath}/${id}/`, data);
      return response.data;
    },
    remove: async (id) => {
      const response = await API.delete(`${resourcePath}/${id}/`);
      return response.data;
    },
  };
}

export const departmentsApi = createCrudApi("departments");
export const doctorsApi = createCrudApi("doctors");
export const patientsApi = createCrudApi("patients");
export const appointmentsApi = createCrudApi("appointments");
export const prescriptionsApi = createCrudApi("prescriptions");
export const medicinesApi = createCrudApi("medicines");
export const billsApi = createCrudApi("bills");