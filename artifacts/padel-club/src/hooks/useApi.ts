import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/utils/api/client";

export function useApiQuery<T>(
  key: string[],
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<T>(path),
    ...options,
  });
}

export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: { onSuccess?: (data: TData) => void; onError?: (error: Error) => void },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}

export function useCreateApi<TData, TVariables>(
  path: string,
  options?: { onSuccess?: (data: TData) => void; onError?: (error: Error) => void },
) {
  return useApiMutation<TData, TVariables>(
    (variables) => apiClient.post<TData>(path, variables),
    options,
  );
}

export function useUpdateApi<TData, TVariables>(
  path: string,
  options?: { onSuccess?: (data: TData) => void; onError?: (error: Error) => void },
) {
  return useApiMutation<TData, TVariables>(
    (variables) => apiClient.patch<TData>(path, variables),
    options,
  );
}

export function useDeleteApi<TData>(
  path: string,
  options?: { onSuccess?: (data: TData) => void; onError?: (error: Error) => void },
) {
  return useApiMutation<TData, void>(
    () => apiClient.delete<TData>(path),
    options,
  );
}
