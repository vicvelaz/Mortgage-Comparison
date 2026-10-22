import { Routes } from '@angular/router';

const loadWorkspace = () => import('./workspace').then((module) => module.Workspace);

export const routes: Routes = [
	{
		path: '',
		loadComponent: loadWorkspace,
		children: [
			{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },
			{ path: 'dashboard', children: [] },
			{ path: 'mortgages', children: [] },
			{ path: 'comparison', children: [] },
			{ path: '**', redirectTo: 'dashboard' },
		],
	},
];
