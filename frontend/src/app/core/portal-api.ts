import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Category,
  CreateRequestInput,
  DashboardSummary,
  ListRequestsQuery,
  RequestDetail,
  RequestPage,
  RequestStatus,
  UpdateRequestInput,
} from '@portal/shared';
import { Observable } from 'rxjs';

// Todas as chamadas à API de solicitações, com os tipos de shared/ (os mesmos da API).
@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories');
  }

  listRequests(query: Partial<ListRequestsQuery>): Observable<RequestPage> {
    // Só vão para a query string os filtros preenchidos.
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params[key] = value;
      }
    }
    return this.http.get<RequestPage>('/api/requests', { params });
  }

  getRequest(id: number): Observable<RequestDetail> {
    return this.http.get<RequestDetail>(`/api/requests/${id}`);
  }

  createRequest(input: CreateRequestInput): Observable<RequestDetail> {
    return this.http.post<RequestDetail>('/api/requests', input);
  }

  updateRequest(id: number, input: UpdateRequestInput): Observable<RequestDetail> {
    return this.http.patch<RequestDetail>(`/api/requests/${id}`, input);
  }

  deleteRequest(id: number): Observable<void> {
    return this.http.delete<void>(`/api/requests/${id}`);
  }

  changeStatus(id: number, status: RequestStatus): Observable<RequestDetail> {
    return this.http.patch<RequestDetail>(`/api/requests/${id}/status`, { status });
  }

  dashboardSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>('/api/dashboard/summary');
  }
}
