import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { PwaConnectionBoundary } from "./pwa/PwaConnectionBoundary";
import { router } from "./router";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <PwaConnectionBoundary>
        <RouterProvider router={router} />
      </PwaConnectionBoundary>
    </QueryClientProvider>
  );
};

export default App;
