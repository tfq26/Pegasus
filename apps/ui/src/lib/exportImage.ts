import { toPng, toJpeg } from 'html-to-image';
import { toast } from '@/composables/useNotifications';

/**
 * Exports a DOM element as an image.
 * Forces light mode with white background for the export.
 */
export async function exportElementAsImage(
    element: HTMLElement,
    fileName: string = 'export',
    format: 'png' | 'jpeg' = 'png'
) {
    if (!element) return;

    const toastId = toast.info(`Preparing ${fileName} for export...`, { duration: 0 });

    try {
        // 1. Prepare for export (Force Light Mode)
        const htmlElement = document.documentElement;
        const previousTheme = htmlElement.className;
        const isDark = htmlElement.classList.contains('dark');

        // Store original styles to restore them later
        const originalStyle = element.getAttribute('style');

        // Force light mode on the root
        if (isDark) {
            htmlElement.classList.remove('dark');
            htmlElement.classList.add('light');
        }

        // Force white background and specific styles on the element itself
        // We add a special class or set inline styles
        element.style.backgroundColor = '#ffffff';
        element.style.color = '#000000';
        element.classList.add('exporting-image');

        // 2. Wait for styles to settle and charts to potentially adjust
        // Trigger a synthetic resize event to help responsive charts recalculate
        window.dispatchEvent(new Event('resize'));

        // Using multiple frames and a longer timeout to ensure rendering is complete,
        // especially for large dashboards with multiple charts.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms for stability

        // 3. Perform capture
        // Get full scroll dimensions to ensure everything is captured
        const fullWidth = element.scrollWidth;
        const fullHeight = element.scrollHeight;

        const options = {
            backgroundColor: '#ffffff',
            quality: 0.95,
            pixelRatio: 2, // High DPI
            width: fullWidth,
            height: fullHeight,
            filter: (node: HTMLElement) => {
                // Skip UI elements like drag handles or buttons if they have specific classes
                if (node.classList?.contains('drag-handle')) return false;
                if (node.classList?.contains('export-hide')) return false;
                return true;
            },
            style: {
                // Ensure no transparency and no scrollbars in capture
                borderRadius: '0px',
                overflow: 'visible'
            }
        };

        let dataUrl: string;
        if (format === 'png') {
            dataUrl = await toPng(element, options);
        } else {
            dataUrl = await toJpeg(element, options);
        }

        // 4. Restore original state
        if (isDark) {
            htmlElement.classList.remove('light');
            htmlElement.classList.add('dark');
        } else {
            htmlElement.className = previousTheme;
        }

        if (originalStyle) {
            element.setAttribute('style', originalStyle);
        } else {
            element.removeAttribute('style');
        }
        element.classList.remove('exporting-image');

        // 5. Trigger download
        const link = document.createElement('a');
        link.download = `${fileName}.${format}`;
        link.href = dataUrl;
        link.click();

        toast.success(`Successfully exported ${fileName}`);
    } catch (error: any) {
        console.error('[Export] Image capture failed:', error);
        toast.error(`Failed to export image: ${error.message}`);
    } finally {
        if (toastId !== null) {
            toast.dismiss(toastId as string | number);
        }
    }
}
