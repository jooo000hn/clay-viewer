export default "@export ecgl.ssao.estimate\n\n#define SHADER_NAME SSAO\n\nuniform sampler2D depthTex;\n\nuniform sampler2D normalTex;\n\nuniform sampler2D noiseTex;\n\nuniform vec2 depthTexSize;\n\nuniform vec2 noiseTexSize;\n\nuniform mat4 projection;\n\nuniform mat4 projectionInv;\n\nuniform mat4 viewInverseTranspose;\n\nuniform vec3 kernel[KERNEL_SIZE];\n\nuniform float radius : 1;\n\nuniform float power : 1;\n\nuniform float bias: 0.01;\n\nuniform float intensity: 1.0;\n\nvarying vec2 v_Texcoord;\n\nfloat ssaoEstimator(in vec3 originPos, in vec3 N, in mat3 kernelBasis) {\n float occlusion = 0.0;\n\n for (int i = 0; i < KERNEL_SIZE; i++) {\n vec3 samplePos = kernel[i];\n#ifdef NORMALTEX_ENABLED\n samplePos = kernelBasis * samplePos;\n#endif\n samplePos = samplePos * radius + originPos;\n\n vec4 texCoord = projection * vec4(samplePos, 1.0);\n texCoord.xy /= texCoord.w;\n texCoord.xy = texCoord.xy * 0.5 + 0.5;\n\n vec4 depthTexel = texture2D(depthTex, texCoord.xy);\n float z = depthTexel.r * 2.0 - 1.0;\n#ifdef ALCHEMY\n vec4 projectedPos = vec4(texCoord.xy * 2.0 - 1.0, z, 1.0);\n vec4 p4 = projectionInv * projectedPos;\n p4.xyz /= p4.w;\n vec3 cDir = p4.xyz - originPos;\n\n float vv = dot(cDir, cDir);\n float vn = dot(cDir, N);\n\n float radius2 = radius * radius;\n\n vn = max(vn + p4.z * bias, 0.0);\n float f = max(radius2 - vv, 0.0) / radius2;\n occlusion += f * f * f * max(vn / (0.01 + vv), 0.0);\n#else\n if (projection[3][3] == 0.0) {\n z = projection[3][2] / (z * projection[2][3] - projection[2][2]);\n }\n else {\n z = (z - projection[3][2]) / projection[2][2];\n }\n float factor = step(samplePos.z, z - bias);\n float rangeCheck = smoothstep(0.0, 1.0, radius / abs(originPos.z - z));\n occlusion += rangeCheck * factor;\n#endif\n }\n#ifdef NORMALTEX_ENABLED\n occlusion = 1.0 - occlusion / float(KERNEL_SIZE);\n#else\n occlusion = 1.0 - clamp((occlusion / float(KERNEL_SIZE) - 0.6) * 2.5, 0.0, 1.0);\n#endif\n return pow(occlusion, power);\n}\n\nvoid main()\n{\n\n vec4 depthTexel = texture2D(depthTex, v_Texcoord);\n\n#ifdef NORMALTEX_ENABLED\n vec4 tex = texture2D(normalTex, v_Texcoord);\n if (dot(tex.rgb, tex.rgb) == 0.0) {\n gl_FragColor = vec4(1.0);\n return;\n }\n vec3 N = tex.rgb * 2.0 - 1.0;\n N = (viewInverseTranspose * vec4(N, 0.0)).xyz;\n\n vec2 noiseTexCoord = depthTexSize / vec2(noiseTexSize) * v_Texcoord;\n vec3 rvec = texture2D(noiseTex, noiseTexCoord).rgb * 2.0 - 1.0;\n vec3 T = normalize(rvec - N * dot(rvec, N));\n vec3 BT = normalize(cross(N, T));\n mat3 kernelBasis = mat3(T, BT, N);\n#else\n if (depthTexel.r > 0.99999) {\n gl_FragColor = vec4(1.0);\n return;\n }\n mat3 kernelBasis;\n#endif\n\n float z = depthTexel.r * 2.0 - 1.0;\n\n vec4 projectedPos = vec4(v_Texcoord * 2.0 - 1.0, z, 1.0);\n vec4 p4 = projectionInv * projectedPos;\n\n vec3 position = p4.xyz / p4.w;\n\n float ao = ssaoEstimator(position, N, kernelBasis);\n ao = clamp(1.0 - (1.0 - ao) * intensity, 0.0, 1.0);\n gl_FragColor = vec4(vec3(ao), 1.0);\n}\n\n@end\n\n\n@export ecgl.ssao.blur\n#define SHADER_NAME SSAO_BLUR\n\nuniform sampler2D ssaoTexture;\n\n#ifdef NORMALTEX_ENABLED\nuniform sampler2D normalTex;\n#endif\n\nvarying vec2 v_Texcoord;\n\nuniform vec2 textureSize;\nuniform float blurSize : 1.0;\n\nuniform int direction: 0.0;\n\n#ifdef DEPTHTEX_ENABLED\nuniform sampler2D depthTex;\nuniform mat4 projection;\nuniform float depthRange : 0.05;\n\nfloat getLinearDepth(vec2 coord)\n{\n float depth = texture2D(depthTex, coord).r * 2.0 - 1.0;\n return projection[3][2] / (depth * projection[2][3] - projection[2][2]);\n}\n#endif\n\nvoid main()\n{\n @import qtek.compositor.kernel.gaussian_9\n\n vec2 off = vec2(0.0);\n if (direction == 0) {\n off[0] = blurSize / textureSize.x;\n }\n else {\n off[1] = blurSize / textureSize.y;\n }\n\n vec2 coord = v_Texcoord;\n\n float sum = 0.0;\n float weightAll = 0.0;\n\n#ifdef NORMALTEX_ENABLED\n vec3 centerNormal = texture2D(normalTex, v_Texcoord).rgb * 2.0 - 1.0;\n#endif\n#if defined(DEPTHTEX_ENABLED)\n float centerDepth = getLinearDepth(v_Texcoord);\n#endif\n\n for (int i = 0; i < 9; i++) {\n vec2 coord = clamp(v_Texcoord + vec2(float(i) - 4.0) * off, vec2(0.0), vec2(1.0));\n\n float w = gaussianKernel[i];\n#ifdef NORMALTEX_ENABLED\n vec3 normal = texture2D(normalTex, coord).rgb * 2.0 - 1.0;\n w *= clamp(dot(normal, centerNormal), 0.0, 1.0);\n#endif\n#ifdef DEPTHTEX_ENABLED\n float d = getLinearDepth(coord);\n w *= (1.0 - clamp(abs(centerDepth - d) / depthRange, 0.0, 1.0));\n#endif\n\n weightAll += w;\n sum += texture2D(ssaoTexture, coord).r * w;\n }\n\n gl_FragColor = vec4(vec3(sum / weightAll), 1.0);\n}\n\n@end\n";
