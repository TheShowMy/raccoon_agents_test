/**
 * 21 种编程语言的 Hello World 示例数据
 * 每项包含 { lang, code } 字段
 */
export const languages = [
  { lang: 'C',          code: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}' },
  { lang: 'C++',        code: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}' },
  { lang: 'Python',     code: 'print("Hello, World!")' },
  { lang: 'Java',       code: 'public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}' },
  { lang: 'JavaScript', code: 'console.log("Hello, World!");' },
  { lang: 'Go',         code: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}' },
  { lang: 'Rust',       code: 'fn main() {\n    println!("Hello, World!");\n}' },
  { lang: 'Ruby',       code: 'puts "Hello, World!"' },
  { lang: 'Swift',      code: 'print("Hello, World!")' },
  { lang: 'Kotlin',     code: 'fun main() {\n    println("Hello, World!")\n}' },
  { lang: 'PHP',        code: '<?php\necho "Hello, World!\\n";' },
  { lang: 'C#',         code: 'using System;\n\nclass HelloWorld {\n    static void Main() {\n        Console.WriteLine("Hello, World!");\n    }\n}' },
  { lang: 'TypeScript', code: 'console.log("Hello, World!");' },
  { lang: 'Lua',        code: 'print("Hello, World!")' },
  { lang: 'Shell',      code: '#!/bin/bash\necho "Hello, World!"' },
  { lang: 'SQL',        code: "SELECT 'Hello, World!' AS greeting;" },
  { lang: 'R',          code: 'cat("Hello, World!\\n")' },
  { lang: 'Scala',      code: 'object HelloWorld {\n  def main(args: Array[String]): Unit = {\n    println("Hello, World!")\n  }\n}' },
  { lang: 'Perl',       code: '#!/usr/bin/perl\nuse strict;\nuse warnings;\n\nprint "Hello, World!\\n";' },
  { lang: 'Dart',       code: "void main() {\n  print('Hello, World!');\n}" },
  { lang: 'Haskell',    code: 'main :: IO ()\nmain = putStrLn "Hello, World!"' },
];
