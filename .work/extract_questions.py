#!/usr/bin/env python3
"""Extract questions from section file and write them individually for review."""
import json
import re
import sys

with open('/Users/pnagar/Projects/GCP-PDE-Mock/.work/section_2_raw.txt', 'r') as f:
    content = f.read().strip()

# The content is a JS object. Let's extract the questions array.
# Find the questions array start
q_start = content.find('questions: [')
if q_start == -1:
    print("Could not find questions array")
    sys.exit(1)

# Get everything after 'questions: ['
q_start += len('questions: [')

# Find the matching closing bracket - the content ends with }] }
# We need to find the end of the questions array
q_content = content[q_start:]

# The questions array ends with '}] }' at the very end
# Let's find all question objects by splitting on '{ q: "'
# First let's convert the JS to JSON-like format

# Count questions
count = content.count('{ q: "')
print(f"Total questions found: {count}")

# Let's split into individual questions
# Each question starts with { q: " and we need to find balanced braces
questions = []
pos = 0
full = content[q_start:]

i = 0
brace_depth = 0
q_starts = []

# Find all positions where '{ q: "' appears in the full content
search_content = content
offset = 0
while True:
    idx = search_content.find('{ q: "', offset)
    if idx == -1:
        break
    q_starts.append(idx)
    offset = idx + 1

print(f"Question start positions found: {len(q_starts)}")

# For each question, extract until the matching closing brace
for i, start in enumerate(q_starts):
    # Find the end by tracking brace depth
    depth = 0
    pos = start
    while pos < len(content):
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
            if depth == 0:
                break
        pos += 1
    
    q_text = content[start:pos+1]
    questions.append(q_text)

print(f"Questions extracted: {len(questions)}")

# Write each question to a separate file for review
for i, q in enumerate(questions):
    with open(f'/Users/pnagar/Projects/GCP-PDE-Mock/.work/q_{i:03d}.txt', 'w') as f:
        f.write(q)

# Also write a summary
with open('/Users/pnagar/Projects/GCP-PDE-Mock/.work/questions_summary.txt', 'w') as f:
    for i, q in enumerate(questions):
        # Extract just the question text
        q_text_start = q.find('"') + 1
        q_text_end = q.find('", opts:')
        if q_text_end == -1:
            q_text_end = q.find('",')
        q_text = q[q_text_start:q_text_end][:100]
        
        # Extract ans
        ans_start = q.find('ans: ') + 5
        ans_end = q.find(',', ans_start)
        ans = q[ans_start:ans_end].strip()
        
        f.write(f"Q{i}: ans={ans} | {q_text}...\n")

print("Done!")
