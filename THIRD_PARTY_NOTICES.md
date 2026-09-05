# Third-Party Notices

## ECDICT

The generated offline dictionary in `src/content/dictionary.generated.json` is derived from
[ECDICT](https://github.com/skywind3000/ECDICT) at commit
`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`, specifically the pinned source file:

https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv

ECDICT is distributed under the MIT License. The authoritative license text for this pinned
version is available at:

https://github.com/skywind3000/ECDICT/blob/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/LICENSE

Transformation summary: the build script normalizes eligible English headwords, reserves all
course-catalog words, extracts one concise Chinese translation and the first phonetic form,
adds deterministic tags, and fills the remaining slots from ranked Oxford-tagged entries.
A small audited manual map applies course-context meanings to proper names (while retaining
available ECDICT phonetics) and supplies variants when the pinned source has no usable translated
entry. The generated dictionary contains exactly 1,000 entries.

The AIFF speech files in `public/audio` are generated locally with the macOS Samantha system
voice. They are not sourced from ECDICT.
