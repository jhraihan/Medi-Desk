import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1/",
});


API.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Access tokens last 15 minutes. On a 401 we refresh once and replay the request.
// All requests that fail while a refresh is in flight wait on the same promise,
// otherwise a page with several parallel calls fires a burst of refreshes.
let refreshing = null;

function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall =
      original?.url?.includes("login/") || original?.url?.includes("token/refresh/");

    if (error.response?.status !== 401 || original?._retried || isAuthCall) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      clearSession();
      return Promise.reject(error);
    }

    original._retried = true;

    refreshing =
      refreshing ??
      API.post("token/refresh/", { refresh: refreshToken })
        .then(({ data }) => {
          localStorage.setItem("access_token", data.access);
          if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
          return data.access;
        })
        .finally(() => {
          refreshing = null;
        });

    try {
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return API(original);
    } catch (refreshError) {
      clearSession();
      window.location.assign("/login");
      return Promise.reject(refreshError);
    }
  },
);


export async function login(username, password) {
  const response = await API.post("login/", { username, password });
  return response.data;
}

export async function register(userData) {
  const response = await API.post("register/", userData);
  return response.data;
}

export async function fetchDashboard() {
  const response = await API.get("dashboard/");
  return response.data;
}

export async function fetchMe() {
  const response = await API.get("auth/me/");
  return response.data;
}

export async function logout() {
  const refresh = localStorage.getItem("refresh_token");
  if (refresh) {
    try {
      await API.post("logout/", { refresh });
    } catch {
      // token already expired or blacklisted; clearing locally is enough
    }
  }
  clearSession();
}


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

export async function fetchAvailableSlots(doctorId, day) {
  const response = await API.get(`doctors/${doctorId}/available-slots/`, {
    params: { date: day },
  });
  return response.data;
}

export async function dispensePrescription(id) {
  const response = await API.post(`prescriptions/${id}/dispense/`);
  return response.data;
}

export async function payBill(id, payment) {
  const response = await API.post(`bills/${id}/pay/`, payment);
  return response.data;
}

// The invoice endpoint needs the auth header, so a plain link in a new tab gets
// a 401. Fetch it through the client and hand the browser a blob instead.
export async function openInvoice(id) {
  const response = await API.get(`bills/${id}/invoice/`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fetchNotifications() {
  const response = await API.get("notifications/");
  return response.data;
}

export async function markNotificationsRead() {
  const response = await API.post("notifications/mark-all-read/");
  return response.data;
}

export const departmentsApi = createCrudApi("departments");
export const doctorsApi = createCrudApi("doctors");
export const patientsApi = createCrudApi("patients");
export const appointmentsApi = createCrudApi("appointments");
export const prescriptionsApi = createCrudApi("prescriptions");
export const medicinesApi = createCrudApi("medicines");
export const billsApi = createCrudApi("bills");