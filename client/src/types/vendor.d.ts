declare module "@splidejs/react-splide" {
  import type { ComponentType, PropsWithChildren } from "react";
  type SplideProps = PropsWithChildren<Record<string, unknown>>;
  export const Splide: ComponentType<SplideProps>;
  export const SplideSlide: ComponentType<PropsWithChildren>;
}

declare module "@splidejs/react-splide/css";

declare module "aos" {
  const AOS: {
    init(options?: Record<string, unknown>): void;
    refresh(): void;
  };
  export default AOS;
}

type HitPayCallbacks = {
  onClose?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
};

type HitPayClient = {
  init(
    url: string,
    options: { domain: string; apiDomain: string },
    callbacks: HitPayCallbacks,
  ): void;
  toggle(options: { paymentRequest: string }): void;
};

interface Window {
  HitPay?: HitPayClient;
}
