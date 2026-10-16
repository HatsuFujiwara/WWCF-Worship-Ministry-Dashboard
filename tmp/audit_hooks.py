import os, re

files_to_check = []
for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            files_to_check.append(os.path.join(root, f))

# Check for any hooks (useState, useEffect, useOverlay, useMemo, useCallback, useRef, etc.)
# that appear after ANY early return in the same function component!

hook_names = {
    'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
    'useId', 'useOverlay', 'useOverlayContext', 'useContext',
    'useSyncExternalStore', 'useReducer', 'useLayoutEffect'
}

for fpath in files_to_check:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    
    in_comp = False
    comp_name = ''
    brace_depth = 0
    early_return = None
    
    for idx, line in enumerate(lines):
        line_num = idx + 1
        
        # Check start of component
        m_comp = re.search(r'(?:export\s+)?(?:const|function)\s+([A-Z]\w+)', line)
        if m_comp and not in_comp:
            in_comp = True
            comp_name = m_comp.group(1)
            brace_depth = 0
            early_return = None
        
        # Strip comments & strings for brace counting
        stripped_line = re.sub(r'//.*$', '', line)
        open_braces = stripped_line.count('{')
        close_braces = stripped_line.count('}')
        
        if in_comp:
            # If line starts at depth 1 (directly in component body)
            if brace_depth == 1:
                # Check for top-level early return
                m_ret = re.search(r'^\s*if\s*\((.*?)\)\s*return(\s+[^;]*)?;', line)
                if m_ret:
                    early_return = (line_num, line.strip())
                
                # Check for hook call
                for h in hook_names:
                    if re.search(r'\b' + h + r'\s*\(', line):
                        if early_return is not None:
                            print(f'CRITICAL HOOK VIOLATION in {fpath} (Component: {comp_name}):')
                            print(f'  Line {early_return[0]}: {early_return[1]}')
                            print(f'  Line {line_num}: Hook {h} called -> {line.strip()}\n')
            
            brace_depth += open_braces - close_braces
            if brace_depth <= 0:
                in_comp = False
                early_return = None
