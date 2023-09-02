import type { GatherArguments } from "https://deno.land/x/ddu_vim@v3.6.0/base/source.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v3.6.0/deps.ts";
import { treePath2Filename } from "https://deno.land/x/ddu_vim@v3.6.0/utils.ts";
import type { ActionData as FileActionData } from "https://deno.land/x/ddu_kind_file@v0.6.0/file.ts";

import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v3.6.0/types.ts";
import { TextLineStream } from "https://deno.land/std@0.201.0/streams/text_line_stream.ts";
import { ChunkedStream } from "https://deno.land/x/chunked_stream@0.1.2/mod.ts";

type ActionData = FileActionData;

type Params = {
  commitHash: string;
  cwd?: string;
};

async function err(denops: Denops, msg: string) {
  await denops.call("ddu#util#print_error", msg, "ddu-source-git_diff_tree");
}

export class ErrorStream extends WritableStream<string> {
  constructor(denops: Denops) {
    super({
      write: async (chunk, _controller) => {
        await err(denops, chunk);
      },
    });
  }
}

export class Source extends BaseSource<Params, ActionData> {
  override kind = "file";

  override gather(
    { denops, sourceOptions, sourceParams }: GatherArguments<Params>,
  ) {
    return new ReadableStream<Item<ActionData>[]>({
      async start(controller) {
        const path = treePath2Filename(sourceOptions.path);
        if (sourceParams.cwd) {
          console.error(
            `WARN: "cwd" for ddu-source-git_diff_tree is deprecated. Use sourceOptions.path instead.`,
          );
        }
        const cwd = sourceParams.cwd ??
          (path && path !== "" ? path : await fn.getcwd(denops));
        const { status, stderr, stdout } = new Deno.Command("git", {
          args: [
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            sourceParams.commitHash,
          ],
          cwd,
          stdin: "null",
          stderr: "piped",
          stdout: "piped",
        }).spawn();
        status.then((stat) => {
          if (!stat.success) {
            stderr
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(new TextLineStream())
              .pipeTo(new ErrorStream(denops));
          }
        });
        stdout
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream())
          .pipeThrough(new ChunkedStream({ chunkSize: 1000 }))
          .pipeTo(
            new WritableStream<string[]>({
              write: (files: string[]) => {
                controller.enqueue(files.map((file) => {
                  return { word: file, action: { path: file } };
                }));
              },
            }),
          ).finally(() => {
            controller.close();
          });
      },
    });
  }

  override params(): Params {
    return { commitHash: "HEAD" };
  }
}
