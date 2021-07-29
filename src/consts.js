/*
 * Copyright (c) 2021, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/**
 * Indicates if we are currently operating in a local testing environment (i.e., Cypress).
 * Used to expose functionality that should not be exposed in a production build.
 * Set to true by gulp when serving locally.
 * @const {boolean}
 */
export const LOCAL_TESTING_BUILD = false;

/**
 * Indicates if this is a dev-only build (i.e., on widget.dev.psi.cash).
 * Used to expose functionality that should not be exposed in a production build.
 * Modified by gulp when serving locally.
 * (The reason this is a string is so that it can be altered by gulp after uglification.)
 * @const {string}
 */
 const DEV_BUILD = 'IS_NOT_DEV_BUILD';
 /**
  * Returns `true` if this is a dev build.
  * @returns {boolean}
  */
 export function isDevBuild() {
  // We're wrapping DEV_BUILD rather than exposing it directly, because:
  // a) It's nicer than requiring magic string comparision everywhere
  // b) If the magic string 'IS_NOT_DEV_BUILD' is used elsewhere, it'll get changed by the build
  // The magic string is weird because we don't want to throw off the source map.

  // @ts-ignore: consts.DEV_BUILD may be changed during build, but TS doesn't know that
  return DEV_BUILD === 'IS_____DEV_BUILD';
 }

 /**
 * The URL prefix to be used for PsiCash API requests to the prod server.
 */
export const PSICASH_API_PREFIX =     'https://api.psi.cash/v1';
/**
 * The URL prefix to be used for PsiCash API requests to the dev server.
 */
export const PSICASH_API_PREFIX_DEV = 'https://api.dev.psi.cash/v1';
//export const PSICASH_API_PREFIX_DEV = 'http://localhost:51337/v1';

/**
 * Storage key for getting/settings PsiCashParams.
 * @const {string}
 */
export const PARAMS_STORAGE_KEY = 'PsiCashParams';
