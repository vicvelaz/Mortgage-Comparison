import { Component, ElementRef, Input, inject, signal } from '@angular/core';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-chart-viewport',
  template: `
    <label class="zoom-control">
      <span>Zoom</span>
      <input
        #zoomInput
        type="range"
        min="100"
        max="400"
        step="50"
        [value]="zoom()"
        [attr.aria-label]="'Zoom: ' + label"
        [attr.aria-valuetext]="zoom() + '%'"
        (input)="setZoom(+zoomInput.value)"
      />
      <output>{{ zoom() }}%</output>
    </label>
    <div class="chart-scroll" tabindex="0" role="region" [attr.aria-label]="label">
      <div class="chart-content" [style.width.%]="zoom()">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-width: 0; }
    .zoom-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 30px; color: var(--muted); font-size: 11px; }
    input { width: 120px; max-width: 45%; margin: 0; accent-color: var(--teal); }
    output { width: 4ch; text-align: right; font-variant-numeric: tabular-nums; }
    .chart-scroll { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }
    .chart-scroll:focus-visible { outline: 2px solid var(--teal); outline-offset: -2px; }
    .chart-content { position: relative; height: 100%; }
  `,
})
export class ChartViewportComponent {
  @Input({ required: true }) label = '';
  readonly zoom = signal(100);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  setZoom(value: number): void {
    this.zoom.set(value);
    requestAnimationFrame(() => {
      const canvas = this.element.nativeElement.querySelector('canvas');
      if (canvas) Chart.getChart(canvas)?.resize();
    });
  }
}