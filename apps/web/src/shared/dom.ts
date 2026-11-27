export const writeText = (element: HTMLElement, text: string) => {
  element.textContent = text;
};

export const observeSize = (
  element: HTMLElement,
  onResize: (width: number, height: number) => void,
) => {
  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;

    if (box !== undefined) onResize(Math.floor(box.width), Math.floor(box.height));
  });

  observer.observe(element);

  return () => observer.disconnect();
};
