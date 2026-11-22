import { toast } from "react-toastify";

export const DELETE_TOAST_CLASS = "magizh-delete-toast";

export function startDeleteToast(message) {
  const id = toast.loading(message, { className: DELETE_TOAST_CLASS });

  // Update immediately and restore the container's normal dismissal settings.
  const finish = (type, render) => toast.update(id, {
    render,
    type,
    isLoading: false,
    delay: 0,
    autoClose: null,
    closeOnClick: null,
    closeButton: null,
    draggable: null,
  });

  return {
    success: (message) => finish("success", message),
    error: (message) => finish("error", message),
  };
}
