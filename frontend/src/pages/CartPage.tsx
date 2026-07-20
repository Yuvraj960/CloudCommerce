import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

function CartPage() {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.get(token!),
    enabled: !!token,
  });

  const updateMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      cartApi.updateItem(token!, productId, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
    onError: (err: any) => {
      if (err?.unauthorized) navigate('/login');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => cartApi.removeItem(token!, productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
    onError: (err: any) => {
      if (err?.unauthorized) navigate('/login');
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => cartApi.clear(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
    onError: (err: any) => {
      if (err?.unauthorized) navigate('/login');
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Please log in to view your cart.</p>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-red-600">Failed to load cart. Please try again.</p>
      </div>
    );
  }

  const cart = data?.data;
  const items = cart?.items || [];

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Shopping Cart</h1>
        <p className="text-gray-500">Your cart is empty.</p>
      </div>
    );
  }

  const total = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Shopping Cart</h1>
        <button
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending}
          className="text-red-600 hover:text-red-700 text-sm font-medium"
        >
          Clear Cart
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="divide-y">
          {items.map((item: any) => (
            <div key={item.productId} className="p-6 flex items-center gap-6">
              <div className="bg-gray-200 border-2 border-dashed rounded-lg w-20 h-20 flex-shrink-0 flex items-center justify-center">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-xs">No Image</span>
                )}
              </div>

              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <p className="text-indigo-600 font-medium">${(item.price / 100).toFixed(2)}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMutation.mutate({ productId: item.productId, quantity: Math.max(1, item.quantity - 1) })}
                  disabled={item.quantity <= 1 || updateMutation.isPending}
                  className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50 disabled:opacity-50"
                >
                  -
                </button>
                <span className="w-8 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateMutation.mutate({ productId: item.productId, quantity: item.quantity + 1 })}
                  disabled={updateMutation.isPending}
                  className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50 disabled:opacity-50"
                >
                  +
                </button>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-900">${((item.price * item.quantity) / 100).toFixed(2)}</p>
                <button
                  onClick={() => removeMutation.mutate(item.productId)}
                  disabled={removeMutation.isPending}
                  className="text-red-600 hover:text-red-700 text-sm mt-1"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-xl font-bold text-gray-900">
              Total: ${(total / 100).toFixed(2)}
            </div>
            <button
              onClick={() => navigate('/checkout')}
              className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CartPage;