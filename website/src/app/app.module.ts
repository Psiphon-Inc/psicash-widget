import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';


import { AppComponent } from './app.component';
import { LoginFormComponent } from './shared/login-form/login-form.component';
import { AccountsComponent } from './components/accounts/accounts.component';
import { ProfileComponent } from './components/profile/profile.component';
import { LedgerComponent } from './components/ledger/ledger.component';
import { SignupFormComponent } from './shared/signup-form/signup-form.component';
import { NavigationComponent } from './shared/navigation/navigation.component';

const routes = [
  { path: 'profile', component: ProfileComponent },
  { path: 'accounts', component: AccountsComponent },
  { path: 'ledger', component: LedgerComponent },
  { path: 'login', component: LoginFormComponent },
  { path: 'signup', component: SignupFormComponent }
]

@NgModule({
  declarations: [
    LoginFormComponent,
    AccountsComponent,
    ProfileComponent,
    LedgerComponent,
    AppComponent,
    SignupFormComponent,
    NavigationComponent
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
    RouterModule.forRoot(
      routes,
      // { enableTracing: true }
    )
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
