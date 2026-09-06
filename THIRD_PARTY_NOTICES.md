# Third-Party Notices

## ECDICT

The generated offline dictionary in `src/content/dictionary.generated.json` is derived from
[ECDICT](https://github.com/skywind3000/ECDICT) at commit
`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`, specifically the pinned source file:

https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv

ECDICT is distributed under the MIT License. The authoritative license text for this pinned
version is available at:

https://github.com/skywind3000/ECDICT/blob/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/LICENSE

MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Transformation summary: the build script normalizes eligible English headwords, reserves all
course-catalog words, extracts one concise Chinese translation and the first phonetic form,
adds deterministic tags, and fills the remaining slots from ranked Oxford-tagged entries.
A small audited manual map applies course-context meanings to proper names (while retaining
available ECDICT phonetics) and supplies variants when the pinned source has no usable translated
entry. The generated dictionary contains exactly 1,000 entries.

The project does not redistribute generated system-voice recordings. English playback is
requested at runtime through the user's browser or operating system.
