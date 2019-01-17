#!/usr/bin/env python3

#
# Copyright (c) 2018, Psiphon Inc.
# All rights reserved.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

import os
import shutil
import random


CURR_WIDGET_VERSION = "v1"

SRC_DIR = "src"
LANDING_DIR = "landing"
DIST_DIR = "dist"

WIDGET_ROOT_DIR = os.path.join(DIST_DIR, "widget")
WIDGET_DIST_DIR = os.path.join(WIDGET_ROOT_DIR, CURR_WIDGET_VERSION)
WIDGET_DEV_ROOT_DIR = os.path.join(DIST_DIR, "widget-dev")
WIDGET_DEV_DIST_DIR = os.path.join(WIDGET_DEV_ROOT_DIR, CURR_WIDGET_VERSION)
LANDING_DIST_DIR = os.path.join(DIST_DIR, "landing")


def clean():
    if os.path.exists(DIST_DIR):
        del_dir = DIST_DIR + "_DELETE"
        os.rename(DIST_DIR, del_dir)
        shutil.rmtree(del_dir)

    # Create the expected dist directories
    os.makedirs(WIDGET_DIST_DIR)
    os.makedirs(WIDGET_DEV_DIST_DIR)

    # We're not creating the landing directory, as the copytree call in do_landing does it
    #os.makedirs(LANDING_DIST_DIR)


def do_landing():
    shutil.copytree(LANDING_DIR, LANDING_DIST_DIR)


def do_widget():
    # The robots.txt file goes above the version directory (i.e., at the domain root)
    shutil.copy2(os.path.join(SRC_DIR, "robots.txt"), WIDGET_ROOT_DIR, follow_symlinks=False)
    shutil.copy2(os.path.join(SRC_DIR, "robots.txt"), WIDGET_DEV_ROOT_DIR, follow_symlinks=False)

    random.seed()
    build_id = '{:x}'.format(random.getrandbits(64))

    with os.scandir(SRC_DIR) as it:
        for entry in it:
            if not entry.name.startswith('.') and entry.is_file():
                # Format the build_id into the filename, where appropriate
                out_fname = entry.name.replace('{build_id}', build_id)

                with open(entry.path, 'r') as in_file:
                    file_contents = in_file.read()

                # Format the build_id into the file contents
                file_contents = file_contents.replace('{build_id}', build_id)

                # Write the PROD version of the file
                with open(os.path.join(WIDGET_DIST_DIR, out_fname), 'w') as out_file:
                    out_file.write(file_contents)

                # Uncomment "//DEV" commented-out stuff
                file_contents = file_contents.replace('//DEV', '')

                # Write the DEV version of the file
                with open(os.path.join(WIDGET_DEV_DIST_DIR, out_fname), 'w') as out_file:
                    out_file.write(file_contents)


if __name__ == "__main__":
    clean()
    do_landing()
    do_widget()
