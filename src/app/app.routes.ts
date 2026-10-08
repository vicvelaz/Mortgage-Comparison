import { Routes } from '@angular/router';

const loadWorkspace = () => import('./workspace').then((module) => module.Workspace);

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },
	{ path: 'dashboard', loadComponent: loadWorkspace },
	{ path: 'mortgages', loadComponent: loadWorkspace },
	{ path: 'comparison', loadComponent: loadWorkspace },
	{ path: '**', redirectTo: 'dashboard' },
];
